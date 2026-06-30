import ast

class OsVisitor(ast.NodeVisitor):
    def __init__(self, filename):
        self.filename = filename

    def visit_FunctionDef(self, node):
        for child in ast.walk(node):
            if isinstance(child, ast.Name) and child.id == 'os' and isinstance(child.ctx, ast.Store):
                print(f"Found local assignment to 'os' in {self.filename}, function {node.name}, line {child.lineno}")
            if isinstance(child, ast.alias) and child.asname == 'os':
                print(f"Found local import aliased to 'os' in {self.filename}, function {node.name}, line {child.lineno}")
            if isinstance(child, ast.Import):
                for name in child.names:
                    if name.name == 'os' and getattr(name, 'asname', None) is None:
                        print(f"Found local import of 'os' in {self.filename}, function {node.name}, line {child.lineno}")
        self.generic_visit(node)

for file in ["app.py", "engine.py", "db.py"]:
    with open(file, "r", encoding="utf-8") as f:
        tree = ast.parse(f.read(), filename=file)
    visitor = OsVisitor(file)
    visitor.visit(tree)
