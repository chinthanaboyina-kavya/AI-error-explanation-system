from django.contrib import admin
from .models import AuthorizedEmail

@admin.register(AuthorizedEmail)
class AuthorizedEmailAdmin(admin.ModelAdmin):
    list_display = ('email', 'display_name', 'is_active', 'authorized_at')
    search_fields = ('email', 'display_name')
    list_filter = ('is_active', 'authorized_at')
