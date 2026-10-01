from django.urls import path, re_path
from . import views

urlpatterns = [
    # Pages
    path('', views.dashboard_view, name='dashboard'),
    re_path(r'^login/?$', views.login_view, name='login'),
    re_path(r'^history/?$', views.history_view, name='history_page'),

    # APIs (supporting both with and without trailing slash)
    re_path(r'^api/auth/verify-email/?$', views.verify_email_api, name='verify_email_api'),
    re_path(r'^api/explain/?$', views.explain_api, name='explain_api'),
    re_path(r'^api/history/?$', views.history_api, name='history_api'),
    re_path(r'^api/history/(?P<history_id>\d+)/?$', views.history_item_api, name='history_item_api'),
    re_path(r'^api/stats/?$', views.stats_api, name='stats_api'),
    re_path(r'^api/models/?$', views.models_api, name='models_api'),
    re_path(r'^api/rebuild-index/?$', views.rebuild_index_api, name='rebuild_index_api'),
    re_path(r'^api/health/?$', views.health_api, name='health_api'),
    re_path(r'^api/feedback/?$', views.feedback_api, name='feedback_api'),
]
