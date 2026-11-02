from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("reviewer", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="practiceform",
            name="categories",
            field=models.JSONField(default=list, blank=True),
        ),
        migrations.AddField(
            model_name="practiceform",
            name="failure_reason",
            field=models.TextField(blank=True),
        ),
    ]