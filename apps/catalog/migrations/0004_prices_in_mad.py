"""Les prix passent de l'euro au dirham marocain (MAD), à 10,8 MAD l'euro : les tarifs du catalogue (matières,
quincaillerie, tarifs du devis de l'atelier) sont convertis une fois, et les valeurs par défaut le sont aussi."""

import django.core.validators
from django.db import migrations, models

EURO_IN_MAD = 10.8


def to_mad(apps, schema_editor):
    Material = apps.get_model("catalog", "Material")
    HardwareRule = apps.get_model("catalog", "HardwareRule")
    CompanyProfile = apps.get_model("catalog", "CompanyProfile")
    for m in Material.objects.all():
        m.price_per_m2 = round(m.price_per_m2 * EURO_IN_MAD, 2)
        m.save(update_fields=["price_per_m2"])
    for r in HardwareRule.objects.all():
        r.unit_price = round(r.unit_price * EURO_IN_MAD, 2)
        r.save(update_fields=["unit_price"])
    for p in CompanyProfile.objects.all():
        for field in ("band", "cut_per_part", "hourly", "per_hole"):
            setattr(p, field, round(getattr(p, field) * EURO_IN_MAD, 2))
        p.save(update_fields=["band", "cut_per_part", "hourly", "per_hole"])


def to_euros(apps, schema_editor):
    Material = apps.get_model("catalog", "Material")
    HardwareRule = apps.get_model("catalog", "HardwareRule")
    CompanyProfile = apps.get_model("catalog", "CompanyProfile")
    for m in Material.objects.all():
        m.price_per_m2 = round(m.price_per_m2 / EURO_IN_MAD, 2)
        m.save(update_fields=["price_per_m2"])
    for r in HardwareRule.objects.all():
        r.unit_price = round(r.unit_price / EURO_IN_MAD, 2)
        r.save(update_fields=["unit_price"])
    for p in CompanyProfile.objects.all():
        for field in ("band", "cut_per_part", "hourly", "per_hole"):
            setattr(p, field, round(getattr(p, field) / EURO_IN_MAD, 2))
        p.save(update_fields=["band", "cut_per_part", "hourly", "per_hole"])


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0003_quote_rates"),
    ]

    operations = [
        migrations.AlterField(
            model_name="material",
            name="price_per_m2",
            field=models.FloatField(default=0, validators=[django.core.validators.MinValueValidator(0)], verbose_name="prix au m² (MAD HT)"),
        ),
        migrations.AlterField(
            model_name="hardwarerule",
            name="unit_price",
            field=models.FloatField(default=0, validators=[django.core.validators.MinValueValidator(0)], verbose_name="prix unitaire (MAD HT)"),
        ),
        migrations.AlterField(
            model_name="companyprofile",
            name="band",
            field=models.FloatField(default=16.2, validators=[django.core.validators.MinValueValidator(0)], verbose_name="chant collé (MAD HT le mètre)"),
        ),
        migrations.AlterField(
            model_name="companyprofile",
            name="cut_per_part",
            field=models.FloatField(default=43.2, validators=[django.core.validators.MinValueValidator(0)], verbose_name="découpe et perçage (MAD HT la pièce)"),
        ),
        migrations.AlterField(
            model_name="companyprofile",
            name="hourly",
            field=models.FloatField(default=486, validators=[django.core.validators.MinValueValidator(0)], verbose_name="taux horaire (MAD HT)"),
        ),
        migrations.AlterField(
            model_name="companyprofile",
            name="per_hole",
            field=models.FloatField(default=0, validators=[django.core.validators.MinValueValidator(0)], verbose_name="trou percé (MAD HT, 0 : compris dans la découpe)"),
        ),
        migrations.RunPython(to_mad, to_euros),
    ]
