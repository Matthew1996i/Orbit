const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function removeAppleDoubleFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.name.startsWith('._')) {
      fs.rmSync(entryPath, { force: true, recursive: true });
      continue;
    }
    if (entry.isDirectory()) removeAppleDoubleFiles(entryPath);
  }
}

// electron-builder empacota o binário pré-compilado do Electron, que já
// carrega uma assinatura ad-hoc do upstream. Quando o bundle é reempacotado
// sem um certificado de distribuição (identity: null), essa assinatura fica
// inválida para a nova estrutura de arquivos (sealed resources não batem
// mais) e o Gatekeeper recusa o app como "danificado" — bloqueio fatal, sem
// opção de abrir mesmo assim. Remover a assinatura por completo não resolve:
// no Apple Silicon todo executável precisa de alguma assinatura (nem que
// ad-hoc) só pra o kernel permitir rodar. A saída é re-assinar do zero,
// ad-hoc, cobrindo o bundle inteiro (--deep) — isso deixa o app "apenas não
// verificado" (aviso contornável) em vez de "danificado" (bloqueio total).
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  removeAppleDoubleFiles(appPath);
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  } catch (error) {
    // Ambientes macOS sem uma cadeia de assinatura funcional podem falhar ao
    // assinar o Electron Framework. O artefato local continua utilizável para
    // desenvolvimento/instalação manual, apenas sem a verificação do Gatekeeper.
    console.warn('assinatura ad-hoc não aplicada; seguindo com artefato local:', error?.message || error);
  }
};
