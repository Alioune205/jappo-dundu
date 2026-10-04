from django.contrib import admin

from .models import PasswordResetCode, SocialAccount


@admin.register(SocialAccount)
class SocialAccountAdmin(admin.ModelAdmin):
    list_display = ('user', 'provider', 'email', 'created_at', 'last_login_at')
    list_filter = ('provider',)
    search_fields = ('user__username', 'email')
    readonly_fields = ('uid', 'created_at', 'last_login_at')


@admin.register(PasswordResetCode)
class PasswordResetCodeAdmin(admin.ModelAdmin):
    list_display = ('user', 'channels', 'attempts', 'expires_at', 'used_at', 'created_at')
    search_fields = ('user__username',)
    readonly_fields = ('code_hash',)
