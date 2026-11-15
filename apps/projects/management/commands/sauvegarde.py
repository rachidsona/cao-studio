"""La sauvegarde de la base (apps/projects/backup.py).

    python manage.py sauvegarde            une copie maintenant
    python manage.py sauvegarde --liste    les copies gardées
"""
from django.core.management.base import BaseCommand, CommandError

from apps.projects.backup import backup_database, backup_dir, backups


class Command(BaseCommand):
    help = "Une copie datée de la base dans le dossier des sauvegardes ; les plus anciennes au-delà du nombre gardé sont effacées."

    def add_arguments(self, parser):
        parser.add_argument("--liste", action="store_true", help="Les copies gardées, sans en faire une.")

    def handle(self, *args, liste=False, **options):
        if liste:
            made = backups()
            for p in made:
                self.stdout.write(f"{p.name}  {p.stat().st_size / 1_048_576:.1f} Mo")
            self.stdout.write(f"{len(made)} copie(s) dans {backup_dir()}")
            return
        try:
            target = backup_database()
        except Exception as error:  # noqa: BLE001
            raise CommandError(f"La sauvegarde a échoué : {error}") from error
        self.stdout.write(self.style.SUCCESS(f"Base copiée : {target}"))
