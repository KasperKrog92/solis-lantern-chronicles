interface CharacterData {
  slug: string;
  name: string;
  color: string;
  summary: string;
  href: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createLoreSpan(char: CharacterData, matchedText: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'lore-link lore-link--character';
  span.dataset.loreSlug = char.slug;
  if (char.color) span.style.color = char.color;

  span.appendChild(document.createTextNode(matchedText));

  const tooltip = document.createElement('span');
  tooltip.className = 'lore-tooltip';
  tooltip.setAttribute('role', 'tooltip');

  const nameEl = document.createElement('span');
  nameEl.className = 'lore-tooltip__name';
  nameEl.textContent = char.name;
  tooltip.appendChild(nameEl);

  const summaryEl = document.createElement('span');
  summaryEl.className = 'lore-tooltip__summary';
  summaryEl.textContent = char.summary;
  tooltip.appendChild(summaryEl);

  const link = document.createElement('a');
  link.href = char.href;
  link.className = 'lore-tooltip__link';
  link.textContent = '→ full entry';
  tooltip.appendChild(link);

  span.appendChild(tooltip);
  return span;
}

function replaceInTextNode(textNode: Text, pattern: RegExp, char: CharacterData) {
  const text = textNode.textContent ?? '';
  pattern.lastIndex = 0;
  if (!pattern.test(text)) return;
  pattern.lastIndex = 0;

  const parent = textNode.parentNode!;
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    fragment.appendChild(createLoreSpan(char, match[0]));
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  parent.replaceChild(fragment, textNode);
}

function walkAndReplace(node: Node, pattern: RegExp, char: CharacterData) {
  if (node.nodeType === Node.TEXT_NODE) {
    replaceInTextNode(node as Text, pattern, char);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  // Skip already-wrapped lore spans and non-content elements
  if (
    el.classList.contains('lore-link') ||
    el.tagName === 'SCRIPT' ||
    el.tagName === 'STYLE'
  ) return;
  Array.from(el.childNodes).forEach(child => walkAndReplace(child, pattern, char));
}

export function replaceCharacterMentions(containerId = 'pt-source') {
  const dataEl = document.getElementById('character-data');
  if (!dataEl) return;

  const characters: CharacterData[] = JSON.parse(dataEl.textContent ?? '[]');
  const container = document.getElementById(containerId);
  if (!container) return;

  // Build matchers: full name + first name for multi-word names
  const matchers: Array<{ nameText: string; pattern: RegExp; char: CharacterData }> = [];

  for (const char of characters) {
    const parts = char.name.split(' ');
    const forms = new Set<string>([char.name]);
    if (parts.length > 1) forms.add(parts[0]);

    for (const form of forms) {
      matchers.push({
        nameText: form,
        pattern: new RegExp(`\\b${escapeRegExp(form)}\\b`, 'g'),
        char,
      });
    }
  }

  // Process longest names first so "Mara Embervale" is wrapped before "Mara"
  matchers.sort((a, b) => b.nameText.length - a.nameText.length);

  for (const { pattern, char } of matchers) {
    walkAndReplace(container, pattern, char);
  }
}
