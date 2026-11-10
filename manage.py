#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    # The commands are run on a developer's computer: debug unless told otherwise (DJANGO_DEBUG=false). The server of
    # production goes through wsgi.py / asgi.py, where debug is off unless set (config/settings.py).
    os.environ.setdefault("DJANGO_DEBUG", "1")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
