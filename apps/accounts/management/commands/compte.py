"""Les comptes de l'atelier : l'inscription libre est fermée (config/settings.py, SIGNUP_OPEN), le personnel les crée.

    python manage.py compte <nom>                 crée ce compte ; le mot de passe est demandé deux fois
    python manage.py compte <nom> --mot-de-passe  change le mot de passe de ce compte
"""
from getpass import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Crée un compte de l'atelier (l'inscription libre est fermée), ou change son mot de passe."

    def add_arguments(self, parser):
        parser.add_argument("nom", help="Le nom du compte.")
        parser.add_argument("--mot-de-passe", action="store_true", help="Change le mot de passe d'un compte existant.")

    def handle(self, *args, nom, mot_de_passe=False, **options):
        users = get_user_model().objects
        nom = nom.strip()
        user = users.filter(username=nom).first()
        if mot_de_passe and user is None:
            raise CommandError(f"Aucun compte « {nom} ».")
        if not mot_de_passe and user is not None:
            raise CommandError(f"Le compte « {nom} » existe déjà (--mot-de-passe pour changer son mot de passe).")
        if user is None:
            user = users.model(username=nom)
            try:
                user.full_clean(exclude=["password"])
            except ValidationError as error:
                raise CommandError(" ".join(error.messages)) from None
        password = getpass("Mot de passe : ")
        if password != getpass("Le même mot de passe : "):
            raise CommandError("Les deux mots de passe diffèrent.")
        try:
            validate_password(password, user)
        except ValidationError as error:
            raise CommandError(" ".join(error.messages)) from None
        user.set_password(password)
        user.save()
        done = "Mot de passe de « {} » changé." if mot_de_passe else "Compte « {} » créé : il peut se connecter."
        self.stdout.write(self.style.SUCCESS(done.format(nom)))
