import base64
from unittest.mock import MagicMock

from services.gemini import build_gemini_receipt_prompt, clean_base64_image
from services.zaim_logic import (
    build_payment_payload,
    build_receipt_items,
    calculate_receipt_total_amount,
    is_duplicate_payment,
    prepare_copy_receipt_groups,
)


class TestIsDuplicatePayment:
    def test_empty_history(self):
        assert is_duplicate_payment([], 1000) is False

    def test_single_item_match(self):
        history = [
            {"id": 1, "mode": "payment", "receipt_id": 0, "amount": 1200}
        ]
        assert is_duplicate_payment(history, 1200) is True
        assert is_duplicate_payment(history, 1000) is False

    def test_receipt_aggregated_match(self):
        history = [
            {"id": 1, "mode": "payment", "receipt_id": 100, "amount": 300},
            {"id": 2, "mode": "payment", "receipt_id": 100, "amount": 700},
            {"id": 3, "mode": "payment", "receipt_id": 200, "amount": 500},
        ]
        # Receipt 100 total = 1000
        assert is_duplicate_payment(history, 1000) is True
        # Receipt 200 total = 500
        assert is_duplicate_payment(history, 500) is True
        assert is_duplicate_payment(history, 800) is False

    def test_ignore_non_payment_modes(self):
        history = [
            {"id": 1, "mode": "income", "receipt_id": 100, "amount": 5000},
            {"id": 2, "mode": "transfer", "receipt_id": 200, "amount": 3000},
        ]
        assert is_duplicate_payment(history, 5000) is False
        assert is_duplicate_payment(history, 3000) is False


class TestCalculateReceiptTotalAmount:
    def test_without_points(self):
        items = [
            MagicMock(price=100),
            MagicMock(price=250),
        ]
        assert calculate_receipt_total_amount(items, point_usage=0) == 350
        assert calculate_receipt_total_amount(items, point_usage=None) == 350

    def test_with_points(self):
        items = [
            MagicMock(price=500),
            MagicMock(price=300),
        ]
        assert calculate_receipt_total_amount(items, point_usage=200) == 600

    def test_with_dict_items(self):
        items = [{"price": 400}, {"price": 600}]
        assert calculate_receipt_total_amount(items, point_usage=100) == 900


class TestBuildReceiptItems:
    def test_normal_items(self):
        raw_items = [
            {"category_id": 101, "genre_id": 10101, "price": 500, "name": "牛乳"},
            {"category_id": 102, "genre_id": 10201, "price": 300, "name": "洗剤"},
        ]
        result = build_receipt_items(raw_items, point_usage=0)
        assert len(result) == 2
        assert result[0] == {"category_id": 101, "genre_id": 10101, "amount": 500, "name": "牛乳"}
        assert result[1] == {"category_id": 102, "genre_id": 10201, "amount": 300, "name": "洗剤"}

    def test_with_point_usage(self):
        raw_items = [
            {"category_id": 105, "genre_id": 10501, "price": 1000, "name": "本"}
        ]
        result = build_receipt_items(raw_items, point_usage=200)
        assert len(result) == 2
        assert result[1]["name"] == "ポイント利用"
        assert result[1]["amount"] == -200
        assert result[1]["category_id"] == 105
        assert result[1]["genre_id"] == 10501


class TestBuildPaymentPayload:
    def test_full_payload(self):
        item = {
            "category_id": 101,
            "genre_id": 10101,
            "amount": 500,
            "name": "コーヒー",
            "place": "カフェA",
            "comment": "ランチ",
            "from_account_id": 10
        }
        payload = build_payment_payload(
            item=item,
            date="2026-09-24",
            store_name="デフォルト店舗",
            from_account_id=99,
            receipt_id=12345
        )
        assert payload["mapping"] == 1
        assert payload["category_id"] == 101
        assert payload["genre_id"] == 10101
        assert payload["amount"] == 500
        assert payload["date"] == "2026-09-24"
        assert payload["name"] == "コーヒー"
        assert payload["place"] == "カフェA"  # item.place overrides store_name
        assert payload["comment"] == "ランチ"
        assert payload["from_account_id"] == 10  # item.from_account_id overrides
        assert payload["receipt_id"] == 12345

    def test_fallback_payload(self):
        item = {
            "category_id": 101,
            "genre_id": 10101,
            "price": 300,
            "name": "パン"
        }
        payload = build_payment_payload(
            item=item,
            date="2026-09-24",
            store_name="スーパーX",
            from_account_id=5,
            receipt_id=None
        )
        assert payload["amount"] == 300
        assert payload["place"] == "スーパーX"
        assert payload["from_account_id"] == 5
        assert payload["receipt_id"] is None


class TestPrepareCopyReceiptGroups:
    def test_grouping_by_receipt(self):
        items = [
            {"date": "2026-09-20", "group_id": 10, "amount": 100, "name": "Item A"},
            {"date": "2026-09-20", "group_id": 10, "amount": 200, "name": "Item B"},
            {"date": "2026-09-21", "group_id": 20, "amount": 500, "name": "Item C"},
            {"date": "2026-09-21", "group_id": None, "amount": 300, "name": "Item Single 1"},
            {"date": "2026-09-21", "group_id": None, "amount": 400, "name": "Item Single 2"},
        ]
        groups = prepare_copy_receipt_groups(items, start_timestamp=1000)

        # Should be 4 groups:
        # 1. group_id=10 (2 items, total=300)
        # 2. group_id=20 (1 item, total=500)
        # 3. single 1 (1 item, total=300)
        # 4. single 2 (1 item, total=400)
        assert len(groups) == 4

        g1 = groups[0]
        assert g1["date"] == "2026-09-20"
        assert g1["group_id"] == 10
        assert g1["total_amount"] == 300
        assert len(g1["items"]) == 2

        g2 = groups[1]
        assert g2["date"] == "2026-09-21"
        assert g2["group_id"] == 20
        assert g2["total_amount"] == 500
        assert len(g2["items"]) == 1

        # All receipt_ids should be distinct
        receipt_ids = [g["receipt_id"] for g in groups]
        assert len(set(receipt_ids)) == len(receipt_ids)


class TestGeminiHelpers:
    def test_clean_base64_image(self):
        original_bytes = b"test image bytes"
        encoded = base64.b64encode(original_bytes).decode("utf-8")
        with_prefix = f"data:image/jpeg;base64,{encoded}"

        assert clean_base64_image(encoded) == original_bytes
        assert clean_base64_image(with_prefix) == original_bytes

    def test_build_gemini_receipt_prompt(self):
        context = "Categories: 食費, 日用品"
        prompt = build_gemini_receipt_prompt(context)
        assert "Categories: 食費, 日用品" in prompt
        assert "point_usage" in prompt
        assert "category_id" in prompt
