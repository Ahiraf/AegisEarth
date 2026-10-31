import hashlib
import hmac
import re
import secrets


class PublicTokens:
    def __init__(self, settings):
        secret = settings.public_token_secret
        if not secret or len(secret.get_secret_value()) < 32:
            raise ValueError("PUBLIC_TOKEN_SECRET requires at least 32 characters")
        self.key = secret.get_secret_value().encode()

    def digest(self, namespace, value):
        return hmac.new(self.key, (namespace + ":" + value).encode(), hashlib.sha256).hexdigest()

    def session(self, cookie):
        if cookie and re.fullmatch(r"[0-9a-f]{64}\.[0-9a-f]{64}", cookie):
            nonce, signature = cookie.split(".")
            if hmac.compare_digest(signature, self.digest("session", nonce)):
                return cookie, self.digest("scope", nonce)
        nonce = secrets.token_hex(32)
        return nonce + "." + self.digest("session", nonce), self.digest("scope", nonce)

    def cancel_token(self, view_id, owner_scope):
        return self.digest("cancel", view_id + ":" + owner_scope)


def token_digest(token):
    return hashlib.sha256(token.encode()).hexdigest()
