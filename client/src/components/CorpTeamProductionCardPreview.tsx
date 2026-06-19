import { wpUpload } from "../lib/marketplaceWpAssets.js";
import { normalizeMarketplaceImageSrc } from "../lib/marketplaceAsicCatalog.js";
import "../styles/marketplace-hashrate.css";

const BUILTIN_PHOTO_FALLBACK: Record<string, string> = {
  fab: wpUpload("FB-Team-1-1024x991.png?v=2"),
  jv: wpUpload("JV-Team-1024x991.png"),
  af: wpUpload("AF-Team-1024x991.png"),
  rg: wpUpload("RG-1024x991.png"),
  dv: wpUpload("DV-Team.png"),
  ab: wpUpload("AB-Team-1024x991.png"),
  dg: wpUpload("DG-Team-HRS-1024x991.png"),
};

const KNOWN_TEAM_IDS = new Set(Object.keys(BUILTIN_PHOTO_FALLBACK));

export type CorpTeamCardPreviewMember = {
  id: string;
  role: string;
  name: string;
  imageUrl: string;
};

export function resolveCorpTeamPhotoForDisplay(memberId: string, imageUrl: string): string {
  const raw = (imageUrl ?? "").trim();
  const fallback = BUILTIN_PHOTO_FALLBACK[memberId];
  if (fallback && /^data:image\/jpe?g/i.test(raw)) {
    return fallback;
  }
  return normalizeMarketplaceImageSrc(raw);
}

/** Misma presentación que /company (i18n en ids legacy). */
export function toCorpTeamProductionCardMember(
  m: { id: string; role: string; name: string; imageUrl: string },
  t: (key: string) => string
): CorpTeamCardPreviewMember {
  const imageUrl = resolveCorpTeamPhotoForDisplay(m.id, m.imageUrl);
  if (!KNOWN_TEAM_IDS.has(m.id)) {
    return { id: m.id, role: m.role.trim(), name: m.name.trim(), imageUrl };
  }
  return {
    id: m.id,
    role: t(`company.m.${m.id}.role`),
    name: t(`company.m.${m.id}.name`),
    imageUrl,
  };
}

type Props = {
  member: CorpTeamCardPreviewMember;
  readBioLabel: string;
};

export function CorpTeamProductionCardPreview({ member, readBioLabel }: Props) {
  return (
    <div className="corp-team-production-preview">
      <article className="market-corp-team-card" data-member={member.id}>
        <div className="market-corp-team-card__btn corp-team-production-preview__btn" aria-hidden>
          <span className="market-corp-team-card__media">
            {member.imageUrl ? (
              <img src={member.imageUrl} alt="" width={500} height={500} loading="lazy" decoding="async" />
            ) : null}
          </span>
          <span className="market-corp-team-card__meta">
            <span className="market-corp-team-card__role">{member.role}</span>
            <span className="market-corp-team-card__name">{member.name}</span>
            <span className="market-corp-team-card__hint">{readBioLabel}</span>
          </span>
        </div>
      </article>
    </div>
  );
}
