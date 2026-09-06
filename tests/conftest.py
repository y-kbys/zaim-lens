import os

# Set dummy environment variables for tests if not provided
os.environ.setdefault("ENCRYPTION_KEY", "dummy_test_encryption_key_for_testing_purposes!")
os.environ.setdefault("FIREBASE_PROJECT_ID", "dummy-zaim-lens-test")
