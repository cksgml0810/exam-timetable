"""app/ 폴더를 HTML 파일 하나로 묶습니다 (사무실 PC 배포용).

    python3 tools/build_single.py   →   dist/시험시간표.html

CSS·JS·글꼴을 모두 파일 안에 넣으므로, 이 파일 하나만 내려받아 더블클릭하면 됩니다.
"""
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
OUT = ROOT / "dist" / "시험시간표.html"


def inline_css(href: str) -> str:
    css_path = APP / href
    css = css_path.read_text(encoding="utf-8")

    def font(m):
        p = (css_path.parent / m.group(1)).resolve()
        data = base64.b64encode(p.read_bytes()).decode()
        return f"url(data:font/woff2;base64,{data})"

    css = re.sub(r"url\('([^']+\.woff2)'\)", font, css)
    return f"<style>\n{css}\n</style>"


def inline_js(src: str) -> str:
    js = (APP / src).read_text(encoding="utf-8")
    js = js.replace("</script", "<\\/script")  # 스크립트 안의 닫는 태그가 HTML을 깨지 않게
    return f"<script>/* {src} */\n{js}\n</script>"


def main():
    html = (APP / "index.html").read_text(encoding="utf-8")
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: inline_css(m.group(1)), html)
    html = re.sub(r'<script src="([^"]+)"></script>', lambda m: inline_js(m.group(1)), html)
    leftovers = re.findall(r'(?:src|href)="(?!data:)[^"]+\.(?:js|css)"', html)
    if leftovers:
        raise SystemExit(f"인라인되지 않은 파일: {leftovers}")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}  ({OUT.stat().st_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()
