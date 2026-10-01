"""Compatibility launcher for the Django application."""

import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ai_project.settings")
    from django.core.management import execute_from_command_line

    args = sys.argv if len(sys.argv) > 1 else [sys.argv[0], "runserver"]
    execute_from_command_line(args)


if __name__ == "__main__":
    main()
