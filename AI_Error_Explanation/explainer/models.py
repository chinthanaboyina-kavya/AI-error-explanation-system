from django.db import models

class AuthorizedEmail(models.Model):
    """
    Stores emails that are authorized to access the system.
    Strictly enforces: Only already signed-in / authorized emails have access.
    """
    email = models.EmailField(unique=True, db_index=True)
    display_name = models.CharField(max_length=150, blank=True)
    authorized_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    notes = models.CharField(max_length=255, blank=True, default='Existing authorized account')

    def __str__(self):
        return f"{self.email} ({'Active' if self.is_active else 'Disabled'})"

    class Meta:
        verbose_name = "Authorized Email"
        verbose_name_plural = "Authorized Emails"
