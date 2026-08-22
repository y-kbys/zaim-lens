import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from services.zaim_client import (
    get_zaim_authorization_params,
    exchange_zaim_access_token
)

def test_get_zaim_authorization_params_success():
    with patch("services.zaim_client.ZAIM_CONSUMER_KEY", "test_key"), \
         patch("services.zaim_client.ZAIM_CONSUMER_SECRET", "test_secret"), \
         patch("services.zaim_client.OAuth1Session") as mock_session_class:
        
        mock_session = MagicMock()
        mock_session.fetch_request_token.return_value = {
            "oauth_token": "req_token_123",
            "oauth_token_secret": "req_secret_456"
        }
        mock_session.authorization_url.return_value = "https://auth.zaim.net/users/auth?oauth_token=req_token_123"
        mock_session_class.return_value = mock_session
        
        params = get_zaim_authorization_params("https://example.com/callback")
        
        assert params["auth_url"] == "https://auth.zaim.net/users/auth?oauth_token=req_token_123"
        assert params["oauth_token"] == "req_token_123"
        assert params["oauth_token_secret"] == "req_secret_456"
        mock_session.fetch_request_token.assert_called_once_with("https://api.zaim.net/v2/auth/request")

def test_get_zaim_authorization_params_missing_consumer_credentials():
    with patch("services.zaim_client.ZAIM_CONSUMER_KEY", None), \
         patch("services.zaim_client.ZAIM_CONSUMER_SECRET", None):
        
        with pytest.raises(HTTPException) as exc_info:
            get_zaim_authorization_params("https://example.com/callback")
        assert exc_info.value.status_code == 500

def test_exchange_zaim_access_token_success():
    with patch("services.zaim_client.ZAIM_CONSUMER_KEY", "test_key"), \
         patch("services.zaim_client.ZAIM_CONSUMER_SECRET", "test_secret"), \
         patch("services.zaim_client.OAuth1Session") as mock_session_class:
        
        mock_session = MagicMock()
        mock_session.fetch_access_token.return_value = {
            "oauth_token": "access_token_abc",
            "oauth_token_secret": "access_secret_xyz"
        }
        mock_session_class.return_value = mock_session
        
        token_res = exchange_zaim_access_token("req_token_123", "req_secret_456", "verifier_789")
        
        assert token_res["oauth_token"] == "access_token_abc"
        assert token_res["oauth_token_secret"] == "access_secret_xyz"
        mock_session.fetch_access_token.assert_called_once_with("https://api.zaim.net/v2/auth/access", verifier="verifier_789")

def test_exchange_zaim_access_token_failure():
    with patch("services.zaim_client.ZAIM_CONSUMER_KEY", "test_key"), \
         patch("services.zaim_client.ZAIM_CONSUMER_SECRET", "test_secret"), \
         patch("services.zaim_client.OAuth1Session") as mock_session_class:
        
        mock_session = MagicMock()
        mock_session.fetch_access_token.side_effect = Exception("Zaim connection error")
        mock_session_class.return_value = mock_session
        
        with pytest.raises(Exception) as exc_info:
            exchange_zaim_access_token("req_token_123", "req_secret_456", "verifier_789")
        assert "OAuth failed" in str(exc_info.value)
