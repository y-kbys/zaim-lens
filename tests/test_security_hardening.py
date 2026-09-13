import os
import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from pydantic import ValidationError

from services.auth import verify_token_manually, verify_token_logic
from schemas import CopyRequest, CopyItem, ParseRequest


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
