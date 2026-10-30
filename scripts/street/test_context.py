"""Tests for 06_context.py: TfL PTAL banding from the access index."""
import importlib.util, os
spec = importlib.util.spec_from_file_location("ctx", os.path.join(os.path.dirname(__file__), "06_context.py"))
ctx = importlib.util.module_from_spec(spec); spec.loader.exec_module(ctx)
cases = {0: "0", 0.01: "1a", 2.5: "1a", 2.51: "1b", 5.01: "2", 10.0: "2", 10.01: "3", 15.01: "4", 20.01: "5", 25.01: "6a", 40.0: "6a", 40.01: "6b", 97.4: "6b"}
for ai, band in cases.items():
    assert ctx.ptal_band(ai) == band, (ai, ctx.ptal_band(ai), band)
print("context tests passed")
