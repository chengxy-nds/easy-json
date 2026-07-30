const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function getWebviewHtml(webview, context, selectedText = '') {
  const distPath = path.join(context.extensionPath, 'dist');
  const indexPath = path.join(distPath, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  // Convert local asset paths to exact signed webview URIs
  const distUri = webview.asWebviewUri(vscode.Uri.file(distPath));
  const cspSource = webview.cspSource;

  const errorDiagnosticScript = `
    <script>
      (function() {
        window.onerror = function(msg, url, line, col, error) {
          if (msg && (msg.indexOf('ResizeObserver') !== -1 || msg.indexOf('Script error') !== -1)) return;
          var div = document.createElement('div');
          div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#1e1e1e;color:#f87171;padding:24px;font-family:monospace;font-size:13px;z-index:999999;overflow:auto;white-space:pre-wrap;';
          div.innerHTML = '<h3 style="color:#ef4444;margin-bottom:12px;">Webview JS Error</h3><b>Message:</b> ' + msg + '\\n<b>URL:</b> ' + url + ':' + line + ':' + col + '\\n\\n<b>Stack:</b>\\n' + (error && error.stack ? error.stack : 'N/A');
          document.body ? document.body.appendChild(div) : document.write(div.outerHTML);
        };
        window.addEventListener('unhandledrejection', function(e) {
          var div = document.createElement('div');
          div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#1e1e1e;color:#f87171;padding:24px;font-family:monospace;font-size:13px;z-index:999999;overflow:auto;white-space:pre-wrap;';
          div.innerHTML = '<h3 style="color:#ef4444;margin-bottom:12px;">Webview Unhandled Rejection</h3><b>Reason:</b> ' + (e.reason && e.reason.stack ? e.reason.stack : e.reason);
          document.body ? document.body.appendChild(div) : document.write(div.outerHTML);
        });
      })();
    </script>
  `;

  // Sign each file individually with asWebviewUri
  html = html.replace(/(src|href)=["'](\.\/|\/)?([^"']+)["']/g, (match, attr, prefix, relPath) => {
    const fullPath = path.join(distPath, relPath);
    if (fs.existsSync(fullPath)) {
      const signedUri = webview.asWebviewUri(vscode.Uri.file(fullPath));
      return `${attr}="${signedUri}"`;
    }
    return match;
  });

  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${cspSource} https: data: blob:; img-src ${cspSource} https: data: blob:; script-src ${cspSource} 'unsafe-inline' 'unsafe-eval'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource} data:;">`;
  const baseTag = `<base href="${distUri}/">`;

  // Inject VS Code Webview flag and initial text
  const initScript = `
    <script>
      window.__VSCODE__ = true;
      try { window.vscodeApi = acquireVsCodeApi(); } catch(e) {}
      ${selectedText ? `window.__VSCODE_INIT_TEXT__ = ${JSON.stringify(selectedText)};` : ''}
    </script>
  `;
  html = html.replace('<head>', `<head>\n  ${cspMeta}\n  ${baseTag}\n  ${errorDiagnosticScript}\n  ${initScript}`);

  return html;
}

class EasyJsonSidebarViewProvider {
  constructor(context) {
    this.context = context;
  }

  resolveWebviewView(webviewView, context, token) {
    // 点击左侧活动栏图标时，自动在右侧编辑器主区域打开全功能大屏 Tab 面板
    vscode.commands.executeCommand('easyjson.open');

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            padding: 24px 16px;
            font-family: var(--vscode-font-family, system-ui, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            text-align: center;
            box-sizing: border-box;
          }
          .title {
            font-size: 14px;
            font-weight: 600;
            margin: 0;
          }
          .desc {
            font-size: 12px;
            opacity: 0.8;
            margin: 0;
            line-height: 1.5;
          }
          .btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
            width: 100%;
            margin-top: 8px;
          }
          .btn:hover {
            background: var(--vscode-button-hoverBackground);
          }
        </style>
      </head>
      <body>
        <div class="title">⚡ easyJSON 开发者工具箱</div>
        <div class="desc">主面板已在右侧 Tab 页打开。也可在代码区选中文本右键快捷提取。</div>
        <button class="btn" onclick="openTab()">🚀 重新打开主 Tab 面板</button>

        <script>
          const vscode = acquireVsCodeApi();
          function openTab() {
            vscode.postMessage('open');
          }
        </script>
      </body>
      </html>
    `;

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message === 'open') {
        vscode.commands.executeCommand('easyjson.open');
      }
    });
  }
}

function activate(context) {
  let activePanel = null;

  // Register Activity Bar Sidebar View
  const sidebarProvider = new EasyJsonSidebarViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('easyjson.sidebarView', sidebarProvider)
  );

  function openEasyJsonWebview(selectedText = '') {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    if (activePanel) {
      activePanel.reveal(column);
      if (selectedText) {
        activePanel.webview.postMessage({ type: 'extractText', text: selectedText });
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'easyJSON',
      'easyJSON 格式化与对比',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(context.extensionPath),
          vscode.Uri.file(path.join(context.extensionPath, 'dist'))
        ]
      }
    );

    activePanel = panel;

    panel.onDidDispose(() => {
      activePanel = null;
    }, null, context.subscriptions);

    panel.webview.html = getWebviewHtml(panel.webview, context, selectedText);

    panel.webview.onDidReceiveMessage(
      (message) => {
        if (message && message.type === 'ready' && selectedText) {
          panel.webview.postMessage({ type: 'extractText', text: selectedText });
        }
      },
      null,
      context.subscriptions
    );

    if (selectedText) {
      setTimeout(() => {
        panel.webview.postMessage({ type: 'extractText', text: selectedText });
      }, 300);
      setTimeout(() => {
        panel.webview.postMessage({ type: 'extractText', text: selectedText });
      }, 800);
    }
  }

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('easyjson.open', () => {
      const editor = vscode.window.activeTextEditor;
      const selectedText = editor ? editor.document.getText(editor.selection) : '';
      openEasyJsonWebview(selectedText);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('easyjson.formatSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selectedText = editor.document.getText(editor.selection);
        openEasyJsonWebview(selectedText);
      } else {
        openEasyJsonWebview('');
      }
    })
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
