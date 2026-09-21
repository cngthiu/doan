from alembic.config import Config
from alembic.script import ScriptDirectory


def test_initial_schema_is_the_only_active_revision() -> None:
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    revisions = list(scripts.walk_revisions())

    assert scripts.get_heads() == ["20260920_0001"]
    assert len(revisions) == 1
    assert revisions[0].revision == "20260920_0001"
    assert revisions[0].doc == "initial_schema"
    assert revisions[0].down_revision is None
