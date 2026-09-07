import base64
import hashlib

from cryptography.fernet import Fernet

import db


def test_encrypt_decrypt_roundtrip(monkeypatch):
    test_key = Fernet.generate_key().decode()
    hashed_key = hashlib.sha256(test_key.encode('utf-8')).digest()
    fernet_key = base64.urlsafe_b64encode(hashed_key)
    monkeypatch.setattr(db, "fernet", Fernet(fernet_key))

    raw_api_key = "AIzaSyDummyKeyForTestingGeminiAPI12345"
    encrypted = db.encrypt_value(raw_api_key)

    assert encrypted != raw_api_key
    assert len(encrypted) > 0

    decrypted = db.decrypt_value(encrypted)
    assert decrypted == raw_api_key

def test_encrypt_empty_or_none():
    assert db.encrypt_value("") == ""
    assert db.decrypt_value("") == ""

def test_decrypt_plain_fallback():
    plain = "plain_unencrypted_text"
    decrypted = db.decrypt_value(plain)
    assert decrypted == plain
