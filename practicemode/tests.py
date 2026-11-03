import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.test import SimpleTestCase

from practicemode.env import load_env_file


class LoadEnvFileTests(SimpleTestCase):
    def load(self, text, environ=None):
        with TemporaryDirectory() as folder, patch.dict(os.environ, environ or {}, clear=True):
            path = Path(folder) / ".env"
            path.write_text(text, encoding="utf-8")
            load_env_file(path)
            return dict(os.environ)

    def test_reads_values_and_skips_comments_and_blank_lines(self):
        env = self.load('# comment\n\nDJANGO_DEBUG=false\nexport A_KEY="quoted value"\nB_KEY=\'x=y\'\nnot a pair\n')
        self.assertEqual(env, {"DJANGO_DEBUG": "false", "A_KEY": "quoted value", "B_KEY": "x=y"})

    def test_real_environment_wins_over_the_file(self):
        env = self.load("DJANGO_DEBUG=false\n", environ={"DJANGO_DEBUG": "true"})
        self.assertEqual(env["DJANGO_DEBUG"], "true")

    def test_missing_file_is_ignored(self):
        with patch.dict(os.environ, {}, clear=True):
            load_env_file(Path("/nonexistent/.env"))
            self.assertEqual(dict(os.environ), {})
