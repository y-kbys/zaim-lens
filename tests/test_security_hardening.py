import os
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from schemas import CopyItem, CopyRequest, ParseRequest
from services.auth import verify_token_manually

# --- Task 1: Strict JWT Verification Tests ---

def test_verify_token_manually_rejects_foreign_project_token():
    """
    Ensure that a token with an audience different from FIREBASE_PROJECT_ID
    raises an exception and is NOT loosely accepted.
    """
    dummy_token = "dummy.foreign.jwt"

    with patch.dict(os.environ, {"FIREBASE_PROJECT_ID": "correct-project-id"}), \
         patch("services.auth.get_firebase_public_keys", return_value={"kid1": "dummy_cert"}), \
         patch("jwt.get_unverified_header", return_value={"kid": "kid1"}), \
         patch("services.auth.x509.load_pem_x509_certificate") as mock_cert, \
         patch("jwt.decode") as mock_decode:

        mock_cert.return_value.public_key.return_value = "mock_public_key"

        # Simulate audience mismatch on strict decode
        import jwt
        mock_decode.side_effect = jwt.InvalidAudienceError("Audience does not match")

        with pytest.raises(jwt.InvalidAudienceError):
            verify_token_manually(dummy_token)

        # Verify decode was called once with strict options and NOT called again with loose options
        assert mock_decode.call_count == 1
        args, kwargs = mock_decode.call_args
        assert kwargs.get("audience") == "correct-project-id"
        assert kwargs.get("issuer") == "https://securetoken.google.com/correct-project-id"
        # Ensure verify_aud: False was never passed
        assert kwargs.get("options", {}).get("verify_aud") is not False


def test_verify_token_manually_succeeds_on_valid_claims():
    """
    Ensure that a token with matching aud and iss succeeds and returns UID.
    """
    dummy_token = "valid.matching.jwt"

    with patch.dict(os.environ, {"FIREBASE_PROJECT_ID": "correct-project-id"}), \
         patch("services.auth.get_firebase_public_keys", return_value={"kid1": "dummy_cert"}), \
         patch("jwt.get_unverified_header", return_value={"kid": "kid1"}), \
         patch("services.auth.x509.load_pem_x509_certificate") as mock_cert, \
         patch("jwt.decode") as mock_decode:

        mock_cert.return_value.public_key.return_value = "mock_public_key"
        mock_decode.return_value = {"uid": "valid_user_123", "aud": "correct-project-id"}

        uid = verify_token_manually(dummy_token)
        assert uid == "valid_user_123"


# --- Task 2: Schema Validation Tests ---

def test_copy_request_rejects_empty_items():
    """CopyRequest must reject items_to_copy with 0 items."""
    with pytest.raises(ValidationError) as excinfo:
        CopyRequest(
            source_account_id="1",
            destination_account_id="2",
            items_to_copy=[]
        )
    errors = excinfo.value.errors()
    assert any(err["loc"] == ("items_to_copy",) for err in errors)


def test_copy_request_accepts_up_to_100_items():
    """CopyRequest must accept up to 100 items."""
    item = CopyItem(
        category_id=101,
        genre_id=10101,
        amount=100,
        date="2026-09-13",
        name="Item"
    )
    req = CopyRequest(
        source_account_id="1",
        destination_account_id="2",
        items_to_copy=[item] * 100
    )
    assert len(req.items_to_copy) == 100


def test_copy_request_rejects_over_100_items():
    """CopyRequest must reject more than 100 items."""
    item = CopyItem(
        category_id=101,
        genre_id=10101,
        amount=100,
        date="2026-09-13",
        name="Item"
    )
    with pytest.raises(ValidationError) as excinfo:
        CopyRequest(
            source_account_id="1",
            destination_account_id="2",
            items_to_copy=[item] * 101
        )
    errors = excinfo.value.errors()
    assert any(err["loc"] == ("items_to_copy",) for err in errors)


def test_parse_request_rejects_empty_image():
    """ParseRequest must reject empty image_base64 string."""
    with pytest.raises(ValidationError) as excinfo:
        ParseRequest(image_base64="")
    errors = excinfo.value.errors()
    assert any(err["loc"] == ("image_base64",) for err in errors)


def test_parse_request_accepts_valid_length_image():
    """ParseRequest accepts image_base64 within valid range."""
    req = ParseRequest(image_base64="a" * 1000)
    assert len(req.image_base64) == 1000


def test_parse_request_rejects_oversized_image():
    """ParseRequest rejects image_base64 exceeding 14,000,000 characters."""
    # We test with 14_000_001 characters
    with pytest.raises(ValidationError) as excinfo:
        ParseRequest(image_base64="a" * 14_000_001)
    errors = excinfo.value.errors()
    assert any(err["loc"] == ("image_base64",) for err in errors)


# --- Task 3: OAuth TTL Tests ---

def test_oauth_secrets_pruning():
    import time

    from routers.zaim import OAUTH_SECRETS, TTL_SECONDS, prune_expired_oauth_secrets

    # Clear existing
    OAUTH_SECRETS.clear()

    now = time.time()
    # Expired token (11 minutes ago)
    OAUTH_SECRETS["expired_token"] = {
        "secret": "s1",
        "name": "Old",
        "user_id": "u1",
        "created_at": now - (TTL_SECONDS + 60)
    }
    # Fresh token (1 minute ago)
    OAUTH_SECRETS["fresh_token"] = {
        "secret": "s2",
        "name": "New",
        "user_id": "u2",
        "created_at": now - 60
    }

    prune_expired_oauth_secrets()

    assert "expired_token" not in OAUTH_SECRETS
    assert "fresh_token" in OAUTH_SECRETS

    # Clean up
    OAUTH_SECRETS.clear()


# --- Task 5: Endpoint Integration Tests ---

def test_endpoint_copy_rejects_empty_items():
    from fastapi.testclient import TestClient

    from main import app
    from services.auth import verify_token

    app.dependency_overrides[verify_token] = lambda: "test_user_id"
    client = TestClient(app)

    res = client.post("/api/copy", json={
        "source_account_id": "1",
        "destination_account_id": "2",
        "items_to_copy": []
    })
    assert res.status_code == 422


def test_endpoint_copy_rejects_over_100_items():
    from fastapi.testclient import TestClient

    from main import app
    from services.auth import verify_token

    app.dependency_overrides[verify_token] = lambda: "test_user_id"
    client = TestClient(app)

    items = [{
        "category_id": 101,
        "genre_id": 10101,
        "amount": 100,
        "date": "2026-09-13",
        "name": "Item"
    }] * 101

    res = client.post("/api/copy", json={
        "source_account_id": "1",
        "destination_account_id": "2",
        "items_to_copy": items
    })
    assert res.status_code == 422


def test_endpoint_parse_rejects_empty_image():
    from fastapi.testclient import TestClient

    from main import app
    from services.auth import verify_token

    app.dependency_overrides[verify_token] = lambda: "test_user_id"
    client = TestClient(app)

    res = client.post("/api/parse", json={"image_base64": ""})
    assert res.status_code == 422


def test_endpoint_zaim_callback_expired_token():
    import time

    from fastapi.testclient import TestClient

    from main import app
    from routers.zaim import OAUTH_SECRETS, TTL_SECONDS

    client = TestClient(app)

    # Simulate an expired token in OAUTH_SECRETS
    expired_token = "tok_expired_123"
    OAUTH_SECRETS[expired_token] = {
        "secret": "sec",
        "name": "Acct",
        "user_id": "uid",
        "created_at": time.time() - (TTL_SECONDS + 10)
    }

    # Call callback with the expired token
    res = client.get(f"/api/zaim/callback?oauth_token={expired_token}&oauth_verifier=ver_123")

    # Must reject or return session lost alert
    assert res.status_code == 200
    assert "Session lost or expired" in res.text

    OAUTH_SECRETS.clear()



