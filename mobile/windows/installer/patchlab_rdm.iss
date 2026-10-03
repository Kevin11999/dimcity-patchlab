; Inno Setup script for PatchLab RDM (Windows). Built in CI by .github/workflows/mobile.yml:
;   ISCC.exe /DAppVersion=0.2.0 /DBuildNumber=12 windows\installer\patchlab_rdm.iss
; Input:  build\windows\x64\runner\Release\   (flutter build windows --release + the VC++ runtime DLLs)
; Output: build\installer\PatchLab-RDM-Setup-<version>-b<build>.exe
; The installer is not code-signed, so Windows SmartScreen asks for one extra click on first run.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef BuildNumber
  #define BuildNumber "0"
#endif
#define AppExe "patchlab_rdm.exe"
#define FirewallRule "PatchLab RDM (Art-Net / RDMnet)"

[Setup]
AppId={{53ABFEA7-2B53-4838-A61F-86120A7A4D1A}
AppName=PatchLab RDM
AppVersion={#AppVersion}
AppVerName=PatchLab RDM {#AppVersion}
AppPublisher=DimCity
DefaultDirName={autopf}\PatchLab RDM
DefaultGroupName=PatchLab RDM
DisableProgramGroupPage=yes
OutputDir=..\..\build\installer
OutputBaseFilename=PatchLab-RDM-Setup-{#AppVersion}-b{#BuildNumber}
SetupIconFile=..\runner\resources\app_icon.ico
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; Admin rights: installs in Program Files and adds the firewall rule below.
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; A running copy must be closed before its files are replaced.
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "nl"; MessagesFile: "compiler:Languages\Dutch.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\..\build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\PatchLab RDM"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\PatchLab RDM"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
; Art-Net nodes answer ArtPoll with UDP to port 6454 (broadcast or unicast); LLRP / mDNS replies are UDP as well.
; Without this rule Windows asks (or silently blocks) on first start and no node shows up.
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""{#FirewallRule}"""; Flags: runhidden; StatusMsg: "Firewall..."
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""{#FirewallRule}"" dir=in action=allow program=""{app}\{#AppExe}"" protocol=udp profile=any enable=yes"; Flags: runhidden; StatusMsg: "Firewall..."
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,PatchLab RDM}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""{#FirewallRule}"""; Flags: runhidden; RunOnceId: "RemoveFirewallRule"
