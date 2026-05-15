// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

// Orange house style override.
// Kept in preload so the theme can be tested without touching the main app logic.
function installOrangeHouseStyle(){
  const css = `
:root{
  --bg:#190b03!important;
  --panel:#241006!important;
  --card:#2b1408!important;
  --card2:#3a1d0d!important;
  --line:#70401f!important;
  --text:#fff5ea!important;
  --muted:#e5b98f!important;
  --acc:#ff9f43!important;
  --blue:#ff9f43!important;
  --cyan:#ffb86b!important;
  --orange:#ff9f43!important;
}
body{
  background:
    radial-gradient(circle at top left,rgba(255,159,67,.32),transparent 32%),
    radial-gradient(circle at top right,rgba(255,184,107,.18),transparent 34%),
    linear-gradient(180deg,#210d03,#0f0703 72%),
    var(--bg)!important;
}
header{
  background:linear-gradient(90deg,#4a2109,#190b03 55%,#7a3a10)!important;
  border-bottom-color:#8a4a22!important;
}
button,.button{
  background:linear-gradient(180deg,#ffb86b,#ff9f43)!important;
  color:#1c0b02!important;
}
aside{background:linear-gradient(180deg,#2b1408,#130802)!important;}
.section{background:linear-gradient(180deg,var(--card),#160903)!important;border-color:var(--line)!important;}
.section h3{background:linear-gradient(90deg,rgba(255,159,67,.22),transparent)!important;border-bottom-color:var(--line)!important;}
.item:hover,#toolsDropdown .dd-item:hover,#fileDropdown .dd-item:hover{background:#3a1d0d!important;}
#fileDropdown,#toolsDropdown,#modalAddLK,#modalAddVeam{background:#241006!important;border-color:#70401f!important;}
select,input[type=text],.inline-controls select,.inline-controls input,.network-instance-fields input,.device-form input,.device-form select{
  background:#160903!important;
  border-color:#70401f!important;
  color:#fff5ea!important;
}
.dim-section{border-left-color:var(--dim-color,#ff9f43)!important;}
.dim-hero{background:linear-gradient(135deg,color-mix(in srgb,var(--dim-color,#ff9f43) 26%,#2b1408),#160903 70%)!important;}
.main-dim-active .section{box-shadow:0 10px 30px rgba(255,159,67,.16)!important;}
.uni-card{
  border-color:color-mix(in srgb,var(--dim-color,#ff9f43) 48%,var(--line))!important;
  border-left-color:var(--dim-color,#ff9f43)!important;
  background:linear-gradient(180deg,color-mix(in srgb,var(--dim-color,#ff9f43) 20%,#2b1408),#160903)!important;
}
.inline-uni-detail,.inline-detail-panel{
  border-color:color-mix(in srgb,var(--dim-color,#ff9f43) 48%,var(--line))!important;
  background:linear-gradient(180deg,color-mix(in srgb,var(--dim-color,#ff9f43) 13%,#2b1408),#160903)!important;
}
.lk-visual{background:linear-gradient(180deg,#321707,#160903)!important;}
.lk-input{background:#160903!important;color:#fff5ea!important;}
.lk-port-cell,.port,.device-card,.device-face,.builder-type-card,.network-instance,.split-calc-box,.universe-pool{
  background:#160903!important;
  border-color:#70401f!important;
}
.lk-port-cell.filled{
  border-color:var(--dim-color,#ff9f43)!important;
  background:color-mix(in srgb,var(--dim-color,#ff9f43) 18%,#160903)!important;
}
.device-face{border-left-color:var(--device-color,#ff9f43)!important;background:linear-gradient(180deg,#2b1408,#160903)!important;}
.device-port{background:#160903!important;border-color:#8a4a22!important;color:#fff5ea!important;}
.device-port[data-bus="A"]{border-color:#ff9f43!important;background:rgba(255,159,67,.14)!important;}
.device-port[data-bus="B"]{border-color:#ffd166!important;background:rgba(255,209,102,.14)!important;}
.uni-pool-chip,.universe-picker button{background:#4a2109!important;border-color:#b96529!important;color:#fff5ea!important;}
.device-port.assignable:hover,.device-port.assignable.drop-hover{border-color:#fff!important;box-shadow:0 0 0 3px rgba(255,159,67,.28)!important;}
.status-dot{box-shadow:0 0 0 2px rgba(255,255,255,.08);}
`;

  const apply = () => {
    if (document.getElementById('orangeHouseStyle')) return;
    const style = document.createElement('style');
    style.id = 'orangeHouseStyle';
    style.textContent = css;
    document.head.appendChild(style);
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', apply, { once:true });
  } else {
    apply();
  }
}
installOrangeHouseStyle();

contextBridge.exposeInMainWorld('app', {
  // CSV openen (voor de import-wizard)
  openCsv: () => ipcRenderer.invoke('openCsv'),

  // (oude) eenvoudige PDF-export via printToPDF (ProjectIO.exportPdf fallback)
  exportPdf: (saveName) => ipcRenderer.invoke('exportPdf', saveName),

  // Nieuwe HTML → PDF export (export-pdf.js)
  exportPdfFromHtml: (args) => ipcRenderer.invoke('exportPdfFromHtml', args),

  // Dialogs & file IO (ProjectIO)
  showSaveDialog: (options) => ipcRenderer.invoke('showSaveDialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('showOpenDialog', options),
  writeTextFile: (args) => ipcRenderer.invoke('writeTextFile', args),
  readTextFile: (filePath) => ipcRenderer.invoke('readTextFile', filePath),

  // Testkanaal
  ping: () => ipcRenderer.invoke('ping')
});
