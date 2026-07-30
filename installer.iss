; ============================================================
;  NewProd Agent -- Inno Setup Script
; ============================================================
#define AppName      "NewProd Agent"
#define AppVersion   "1.0.0"
#define AppPublisher "Ingresso Ideal"
#define AppExeName   "NewProd.exe"
#define AppURL       "https://ingresso-ideal.vercel.app"
#define AppId        "{{A7F3C2D1-8B4E-4F6A-9C2D-1E5F7A8B3C4D}"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
; {localappdata} nao exige admin - evita erro 0x80070005
DefaultDirName={localappdata}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=no
LicenseFile=
; lowest = nao pede UAC, instala para o usuario atual
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=dist
OutputBaseFilename=NewProd_Setup_v{#AppVersion}
SetupIconFile=agent_icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardResizable=no
DisableDirPage=no
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
VersionInfoVersion={#AppVersion}
VersionInfoCompany={#AppPublisher}
VersionInfoDescription={#AppName} - Agente de Imposicao e Impressao Local
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon";    Description: "Criar atalho na &Area de Trabalho";    GroupDescription: "Atalhos adicionais:"
Name: "startupicon";   Description: "Iniciar automaticamente com o &Windows"; GroupDescription: "Atalhos adicionais:"

[Files]
Source: "dist\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; {userstartmenu} e {userdesktop} nao exigem admin (apenas para o usuario atual)
Name: "{userstartmenu}\{#AppName}";  FileName: "{app}\{#AppExeName}"
Name: "{userdesktop}\{#AppName}";    FileName: "{app}\{#AppExeName}"; Tasks: desktopicon

[Registry]
; Iniciar com Windows (opcional, via tarefa selecionada no instalador)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "NewProdAgent"; \
  ValueData: """{app}\{#AppExeName}"""; \
  Flags: uninsdeletevalue; Tasks: startupicon

[Run]
; Inicia o agente apos a instalacao (opcional)
Filename: "{app}\{#AppExeName}"; \
  Description: "Iniciar {#AppName} agora"; \
  Flags: nowait postinstall skipifsilent unchecked

[UninstallRun]
; Encerra o processo antes de desinstalar
Filename: "taskkill.exe"; Parameters: "/F /IM {#AppExeName}"; Flags: runhidden; RunOnceId: "KillAgent"

[Code]
// Verifica se o agente ja esta rodando e oferece encerra-lo antes de atualizar
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  if CheckForMutexes('NewProdAgent') then begin
    if MsgBox('O NewProd Agent esta em execucao.' + #13#10 +
              'Deseja encerra-lo antes de continuar a instalacao?',
              mbConfirmation, MB_YESNO) = IDYES then begin
      Exec('taskkill.exe', '/F /IM {#AppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Sleep(1000);
    end;
  end;
end;
