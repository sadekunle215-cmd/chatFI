// src/components/ui/Icons.jsx
export const SvgChat = ({size=16,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

export const SvgWallet = ({size=16,color="currentColor"}) => ( /* paste your original */ );
export const SvgZap = ({size=16,color="currentColor"}) => ( /* paste */ );
// ... continue pasting ALL your other Svg* components

export {
  SvgChat, SvgWallet, SvgZap, SvgBarChart, SvgLink, SvgTwitterX, SvgDiscord,
  SvgTelegram, SvgGithub, SvgBlog, SvgPhone, SvgLock, SvgPalette, SvgCoin,
  SvgMap, SvgUpload, SvgCalendar, SvgRocket, SvgWarning, SvgFrog, SvgArrowReturn, SvgSearch
};
