import re

class PPDParser:
    def __init__(self, file_path):
        self.file_path = file_path
        self.model_name = "Generic PostScript Printer"
        self.nick_name = "Generic PostScript"
        self.options = {} # format: {option_key: {translation: str, default: str, choices: {choice_key: {translation: str, code: str}}}}
        self.parse()

    def parse(self):
        try:
            with open(self.file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
        except Exception as e:
            print(f"Error opening PPD file: {e}")
            return

        current_ui = None
        current_ui_key = None
        in_multiline = False
        multiline_accum = []
        multiline_key = None
        multiline_choice = None

        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Handle multiline string reading
            if in_multiline:
                # Check if this line ends the multiline string
                if line.endswith('"') or '"' in line:
                    idx = line.find('"')
                    multiline_accum.append(line[:idx])
                    # End multiline
                    code = "\n".join(multiline_accum).strip()
                    self._add_choice_code(multiline_key, multiline_choice, code)
                    in_multiline = False
                    multiline_accum = []
                else:
                    multiline_accum.append(line)
                i += 1
                continue

            if not line.startswith('*'):
                i += 1
                continue

            # Core fields
            if line.startswith('*ModelName:'):
                val = line.split(':', 1)[1].strip().strip('"')
                self.model_name = val
                i += 1
                continue
            if line.startswith('*NickName:'):
                val = line.split(':', 1)[1].strip().strip('"')
                self.nick_name = val
                i += 1
                continue

            # OpenUI
            if line.startswith('*OpenUI *'):
                # Format: *OpenUI *OptionKey/Translation: Type
                m = re.match(r'^\*OpenUI\s+\*([^/:]+)(?:/([^:]+))?\s*:\s*(.*)$', line)
                if m:
                    key = m.group(1).strip()
                    trans = m.group(2).strip() if m.group(2) else key
                    self.options[key] = {
                        "translation": trans,
                        "default": None,
                        "choices": {}
                    }
                    current_ui_key = key
                i += 1
                continue

            # CloseUI
            if line.startswith('*CloseUI:'):
                current_ui_key = None
                i += 1
                continue

            # Default value
            if line.startswith('*Default'):
                # Format: *DefaultOptionKey: ChoiceKey
                m = re.match(r'^\*Default([^:]+)\s*:\s*(.*)$', line)
                if m:
                    opt_key = m.group(1).strip()
                    default_choice = m.group(2).strip().strip('"')
                    if opt_key in self.options:
                        self.options[opt_key]["default"] = default_choice
                i += 1
                continue

            # Choice and code
            # Check if this is an option choice line (e.g. *PageSize A4/A4: "..." or *PageSize A4: "...")
            # We match lines like: *OptionKey ChoiceKey/Translation: "code" or "
            m = re.match(r'^\*([^/:\s]+)\s+([^/:\s]+)(?:/([^:]+))?\s*:\s*(.*)$', line)
            if m:
                opt_key = m.group(1).strip()
                choice_key = m.group(2).strip()
                choice_trans = m.group(3).strip() if m.group(3) else choice_key
                val_part = m.group(4).strip()

                if opt_key in self.options:
                    # Initialize choice structure
                    self.options[opt_key]["choices"][choice_key] = {
                        "translation": choice_trans,
                        "code": ""
                    }
                    
                    if val_part.startswith('"'):
                        if val_part.endswith('"') and len(val_part) > 1 and not val_part.endswith('\\"'):
                            # Single line code
                            code = val_part[1:-1].strip()
                            self._add_choice_code(opt_key, choice_key, code)
                        else:
                            # Start multiline
                            in_multiline = True
                            multiline_key = opt_key
                            multiline_choice = choice_key
                            multiline_accum = [val_part[1:]]
            i += 1

    def _add_choice_code(self, opt_key, choice_key, code):
        # Cleans and sets PostScript code
        clean_code = code.replace('^D', '').replace('\x04', '').strip()
        if opt_key in self.options and choice_key in self.options[opt_key]["choices"]:
            self.options[opt_key]["choices"][choice_key]["code"] = clean_code

    def get_dict(self):
        return {
            "model_name": self.model_name,
            "nick_name": self.nick_name,
            "options": self.options
        }
