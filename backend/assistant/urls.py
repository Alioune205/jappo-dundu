from django.urls import path

from .views import AskAssistantView

urlpatterns = [
    path('ask/', AskAssistantView.as_view(), name='assistant-ask'),
]
