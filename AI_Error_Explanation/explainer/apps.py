from django.apps import AppConfig

class ExplainerConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'explainer'

    def ready(self):
        from rag.retriever import init_database
        init_database()
