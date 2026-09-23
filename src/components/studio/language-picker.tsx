"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Globe, Search } from "lucide-react";
import { COUNTRIES, countriesInText, findCountry, type Country } from "@/lib/studio/countries";
import { TRANSLATION_LANGUAGE_CATALOG, TRANSLATION_TIER_LABEL, type TranslationLanguageEntry, type TranslationTier } from "@/lib/studio/language-catalog";
import { studioLanguages } from "@/lib/studio/languages";

/** Flag images are copied from the MIT-licensed flag-icons package into /public/flags. */
export function Flag({ code, className = "h-3.5 w-[1.2rem]" }: { code: string | null | undefined; className?: string }) {
  if (!code) return <Globe className={`${className} shrink-0 text-[#8b9bad]`} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/flags/${code}.svg`} alt="" loading="lazy" className={`${className} shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(36,52,71,0.12)]`} />;
}

export type LanguageChoice = { code: string; name: string; entry: TranslationLanguageEntry | null };

const TIER_TONE: Record<TranslationTier, string> = {
  STRONG: "bg-emerald-50 text-emerald-700",
  GOOD_PRACTICAL: "bg-amber-50 text-amber-700",
  EXPERIMENTAL_VERIFY: "bg-rose-50 text-rose-700"
};

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

const flagCache = new Map<string, string | null>();
export function languageFlag(entry: TranslationLanguageEntry | null) {
  if (!entry) return null;
  if (!flagCache.has(entry.id)) flagCache.set(entry.id, countriesInText(entry.primaryRegion)[0]?.code ?? null);
  return flagCache.get(entry.id) ?? null;
}

/** Flag for a saved localization: its chosen country when that is a country, otherwise the language's main country. */
export function projectFlag(code: string, name: string, region?: string | null) {
  return findCountry(region)?.code ?? languageFlag(findCatalogLanguage(code, name));
}

/** A saved project language back to its catalog entry: by name first (two catalog languages share "rw"), then by code. */
export function findCatalogLanguage(code: string | null | undefined, name: string | null | undefined) {
  const byName = name ? TRANSLATION_LANGUAGE_CATALOG.find((entry) => normalize(entry.englishName) === normalize(name) || normalize(entry.autonym) === normalize(name)) : undefined;
  if (byName) return byName;
  const studioName = studioLanguages.find((entry) => entry.code === code && (!name || normalize(entry.name) === normalize(name)));
  if (studioName) return TRANSLATION_LANGUAGE_CATALOG.find((entry) => entry.isoCode === code) ?? null;
  return null;
}

const FEATURED = studioLanguages
  .map((language) => TRANSLATION_LANGUAGE_CATALOG.find((entry) => entry.isoCode === language.code))
  .filter((entry): entry is TranslationLanguageEntry => Boolean(entry));

const GROUPS = (() => {
  const groups = new Map<string, TranslationLanguageEntry[]>();
  for (const entry of TRANSLATION_LANGUAGE_CATALOG) groups.set(entry.regionGroup, [...(groups.get(entry.regionGroup) ?? []), entry]);
  return [...groups.entries()].map(([title, entries]) => ({ title, entries: [...entries].sort((a, b) => a.englishName.localeCompare(b.englishName)) }));
})();

function searchLanguages(query: string) {
  const q = normalize(query);
  const scored: Array<{ entry: TranslationLanguageEntry; score: number }> = [];
  for (const entry of TRANSLATION_LANGUAGE_CATALOG) {
    const name = normalize(entry.englishName);
    const autonym = normalize(entry.autonym);
    let score = 0;
    if (name === q || autonym === q || entry.isoCode === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (autonym.startsWith(q)) score = 70;
    else if (name.includes(q) || autonym.includes(q)) score = 50;
    else if (normalize(entry.primaryRegion).includes(q)) score = 30;
    else if (normalize(entry.regionGroup).includes(q)) score = 10;
    if (score) scored.push({ entry, score: score + (FEATURED.includes(entry) ? 5 : 0) });
  }
  return scored.sort((a, b) => b.score - a.score || a.entry.englishName.localeCompare(b.entry.englishName)).map((item) => item.entry);
}

/**
 * Translation language picker over the 343-language GPT translation catalog:
 * search by name, native name or country, flags from each language's main
 * country, and the catalog's quality tier. Opens inline (not a floating
 * menu) so it is never clipped inside a scrolling dialog.
 */
export function LanguagePicker({ value, onChange }: { value: { code: string; name: string }; onChange: (choice: LanguageChoice) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = findCatalogLanguage(value.code, value.name);
  const results = useMemo(() => (query.trim() ? searchLanguages(query) : null), [query]);
  const exact = results?.some((entry) => normalize(entry.englishName) === normalize(query) || normalize(entry.autonym) === normalize(query));

  const pick = (choice: LanguageChoice) => {
    onChange(choice);
    setOpen(false);
    setQuery("");
  };
  const pickEntry = (entry: TranslationLanguageEntry) => pick({ code: entry.isoCode, name: entry.englishName, entry });
  const pickCustom = () => {
    const name = query.trim().replace(/\s+/g, " ").slice(0, 60);
    pick({ code: normalize(name).replace(/[^a-z]/g, "").slice(0, 8) || "xx", name, entry: null });
  };

  const row = (entry: TranslationLanguageEntry, key: string) => {
    const active = selected?.id === entry.id;
    return (
      <button
        key={key}
        type="button"
        onClick={() => pickEntry(entry)}
        className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${active ? "bg-[#fbeaea]" : "hover:bg-[#f7f8fa]"}`}
      >
        <Flag code={languageFlag(entry)} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-bold ${active ? "text-[#a64026]" : "text-[#243447]"}`}>
            {entry.englishName}
            {entry.autonym && normalize(entry.autonym) !== normalize(entry.englishName) && <span className="font-semibold text-[#8b9bad]"> · {entry.autonym}</span>}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-[#6b7c8f]">
            <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${TIER_TONE[entry.tier]}`}>{TRANSLATION_TIER_LABEL[entry.tier]}</span>
            <span className="truncate">{entry.primaryRegion}</span>
          </span>
        </span>
        {active && <Check className="size-4 shrink-0 text-[#a64026]" />}
      </button>
    );
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
        aria-expanded={open}
        className="flex h-11 w-full items-center gap-3 rounded-lg border border-[#d8dde5] bg-white px-3 text-left shadow-sm hover:border-[#c9d0da]"
      >
        <Flag code={languageFlag(selected)} className="h-4 w-[1.35rem]" />
        <span className="min-w-0 flex-1 truncate font-bold text-[#243447]">
          {value.name || "Choose a language"}
          {selected && normalize(selected.autonym) !== normalize(selected.englishName) && <span className="font-semibold text-[#8b9bad]"> · {selected.autonym}</span>}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-[#6b7c8f] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {!open && selected && (
        <p className="mt-1.5 text-xs text-[#6b7c8f]">
          <span className={`mr-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${TIER_TONE[selected.tier]}`}>{TRANSLATION_TIER_LABEL[selected.tier]}</span>
          AI translation quality for {selected.englishName}{selected.tier === "STRONG" ? "." : selected.tier === "GOOD_PRACTICAL" ? " — review uncommon terms." : " — have a fluent speaker review every line."}
        </p>
      )}
      {open && (
        <div className="mt-2 rounded-xl border border-[#d8dde5] bg-white shadow-sm">
          <div className="border-b border-[#edf0f3] p-2">
            <div className="mlp-input flex h-10 items-center gap-2">
              <Search className="size-4 shrink-0 text-[#8b9bad]" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setOpen(false);
                    setQuery("");
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (results?.[0]) pickEntry(results[0]);
                    else if (query.trim()) pickCustom();
                  }
                }}
                placeholder="Search by language, native name or country…"
                className="h-full w-full border-0 bg-transparent p-0 text-sm text-[#243447] outline-none"
                aria-label="Search languages"
              />
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {results ? (
              <>
                {results.slice(0, 80).map((entry) => row(entry, entry.id))}
                {results.length === 0 && <p className="px-2.5 py-3 text-sm text-[#6b7c8f]">No language in the catalog matches “{query.trim()}”.</p>}
              </>
            ) : (
              <>
                <GroupTitle>Used most at MLP</GroupTitle>
                {FEATURED.map((entry) => row(entry, `featured-${entry.id}`))}
                {GROUPS.map((group) => (
                  <div key={group.title}>
                    <GroupTitle>{group.title} · {group.entries.length}</GroupTitle>
                    {group.entries.map((entry) => row(entry, entry.id))}
                  </div>
                ))}
              </>
            )}
            {query.trim() && !exact && (
              <button type="button" onClick={pickCustom} className="mt-1 flex w-full items-center gap-3 rounded-lg border border-dashed border-[#d8dde5] px-2.5 py-2 text-left text-sm font-bold text-[#a64026] hover:bg-[#fbeaea]/50">
                <Globe className="size-4 shrink-0" /> Use “{query.trim()}” as the language
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <div className="sticky top-0 z-10 bg-white px-2.5 pb-1 pt-3 text-[11px] font-extrabold uppercase tracking-wide text-[#8b9bad]">{children}</div>;
}

/** Countries to suggest first for a language: those its catalog region names, then MLP's own list. */
export function suggestedCountries(choice: { code: string; name: string }): Country[] {
  const entry = findCatalogLanguage(choice.code, choice.name);
  const fromCatalog = entry ? countriesInText(entry.primaryRegion) : [];
  const fromStudio = (studioLanguages.find((language) => language.code === choice.code)?.regions ?? [])
    .map((name) => findCountry(name))
    .filter((country): country is Country => Boolean(country));
  const unique = new Map<string, Country>();
  for (const country of [...fromCatalog, ...fromStudio]) if (!unique.has(country.code)) unique.set(country.code, country);
  return [...unique.values()];
}

/** Region / country field: suggested countries for the language, a searchable country list with flags, or any free text. */
export function RegionPicker({ value, onChange, language }: { value: string; onChange: (value: string) => void; language: { code: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const suggested = useMemo(() => suggestedCountries(language), [language]);
  const current = findCountry(value);
  const q = normalize(value);
  const matching = COUNTRIES.filter((country) => !q || current || normalize(country.name).includes(q) || (country.aliases ?? []).some((alias) => normalize(alias).includes(q)));
  const others = matching.filter((country) => !suggested.some((entry) => entry.code === country.code));

  const choose = (country: Country) => {
    onChange(country.name);
    setOpen(false);
  };

  return (
    <div
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="mlp-input flex items-center gap-2">
        {current ? <Flag code={current.code} /> : <Search className="size-4 shrink-0 text-[#8b9bad]" />}
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              event.stopPropagation();
              setOpen(false);
            }
          }}
          placeholder={suggested[0] ? `e.g. ${suggested[0].name} (optional)` : "Optional"}
          className="h-full w-full border-0 bg-transparent p-0 text-[#243447] outline-none"
          aria-label="Region or country"
        />
        {value && (
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onChange("")} className="shrink-0 text-xs font-bold text-[#8b9bad] hover:text-[#a64026]">Clear</button>
        )}
      </div>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-[#d8dde5] bg-white p-1.5 shadow-sm">
          {suggested.length > 0 && !q && (
            <>
              <GroupTitle>Suggested for {language.name}</GroupTitle>
              {suggested.map((country) => <CountryRow key={`s-${country.code}`} country={country} active={current?.code === country.code} onPick={choose} />)}
              <GroupTitle>All countries</GroupTitle>
            </>
          )}
          {(q && !current ? [...suggested.filter((country) => matching.includes(country)), ...others] : others).map((country) => (
            <CountryRow key={country.code} country={country} active={current?.code === country.code} onPick={choose} />
          ))}
          {q && !current && matching.length === 0 && <p className="px-2.5 py-2 text-sm text-[#6b7c8f]">No country matches — “{value.trim()}” will be used as written.</p>}
        </div>
      )}
    </div>
  );
}

function CountryRow({ country, active, onPick }: { country: Country; active: boolean; onPick: (country: Country) => void }) {
  return (
    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(country)} className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm font-bold ${active ? "bg-[#fbeaea] text-[#a64026]" : "text-[#243447] hover:bg-[#f7f8fa]"}`}>
      <Flag code={country.code} />
      <span className="flex-1 truncate">{country.name}</span>
      {active && <Check className="size-4 shrink-0 text-[#a64026]" />}
    </button>
  );
}
