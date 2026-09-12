import { useEffect, useState } from "react";
import type { ThemeConfig } from "antd";

// resto do app nao usa AntD (Ionic + CSS custom) — escopado so pra dentro
// das telas cheias de LLM via <ConfigProvider theme={...}>, sem vazar pro
// resto do shell. Fundo branco fixo (pedido explicito, "estilo GitHub"), mas
// colorPrimary/colorLink acompanham a cor de destaque do tema fixo da
// aplicacao (theme/themes.ts, --orbit-accent) em vez de um preto fixo.
function readAccent(): string {
  if (typeof document === "undefined") return "#18181b";
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--orbit-accent")
    .trim();
  return v || "#18181b";
}

// hook em vez de constante estatica — o atributo data-theme so existe no
// <html> depois do boot (ver main.tsx), e essas telas sao autocontidas (nao
// recebem nenhum id de tema via prop); um MutationObserver nesse atributo
// garante o valor certo mesmo se o accent for lido antes do boot terminar.
export function useLlmScreenTheme(): ThemeConfig {
  const [accent, setAccent] = useState(readAccent);

  useEffect(() => {
    const update = () => setAccent(readAccent());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return {
    token: {
      colorPrimary: accent,
      colorLink: accent,
      colorLinkHover: accent,
      borderRadius: 10,
      fontFamily:
        '"Switzer", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      colorBorder: "#e4e4e7",
      colorText: "#111114",
      colorTextSecondary: "#71717a",
      colorTextTertiary: "#a1a1aa",
      controlHeightLG: 44,
      // remove o anel de foco (box-shadow colorido em volta do controle) que
      // o AntD desenha por padrao em Input/Select/Button etc — pedido
      // explicito, nao curte esse efeito.
      controlOutlineWidth: 0,
    },
  };
}
