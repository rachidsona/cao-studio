"""Le personnel de l'atelier : les comptes qui modifient le catalogue, les tarifs et le profil (/catalogue/).

    python manage.py personnel                 la liste du personnel
    python manage.py personnel <nom>           met ce compte dans le personnel
    python manage.py personnel <nom> --retirer  l'en retire
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Le personnel de l'atelier : les comptes qui modifient le catalogue, les tarifs et le profil."

    def add_arguments(self, parser):
        parser.add_argument("nom", nargs="?", help="Le nom du compte.")
        parser.add_argument("--retirer", action="store_true", help="Retire ce compte du personnel.")

    def handle(self, *args, nom=None, retirer=False, **options):
        users = get_user_model().objects
        if not nom:
            names = list(users.filter(is_staff=True).order_by("username").values_list("username", flat=True))
            self.stdout.write(", ".join(names) if names else "Personne n'est dans le personnel.")
            return
        try:
            user = users.get(username=nom)
        except users.model.DoesNotExist:
            raise CommandError(f"Aucun compte « {nom} ».") from None
        user.is_staff = not retirer
        user.save(update_fields=["is_staff"])
        self.stdout.write(self.style.SUCCESS(f"« {nom} » {'retiré du' if retirer else 'mis dans le'} personnel de l'atelier."))
