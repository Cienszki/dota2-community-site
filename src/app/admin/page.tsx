'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import ClientLightPillar from '@/components/ClientLightPillar';
import Navbar from '@/components/Navbar';
import {
  Trash2, Edit2, Plus, Save, X, Newspaper, ChevronDown,
  Settings, Upload, Trophy, BookOpen, Check, Users, Radio, MessageSquare, Star, FileText, GripVertical,
  Swords, Eye, EyeOff, Gamepad2, ChevronRight, HelpCircle, ListOrdered,
} from 'lucide-react';
import RichTextEditor from '@/components/RichTextEditor';
import { CONTENT_PAGES, type ContentSlug } from '@/lib/content-pages';
import { toast } from 'sonner';
import {
  addStreamer, updateStreamer, deleteStreamer, updateStreamerPositions,
  getRankPlayers, deleteRankPlayer,
  getTop5000Players, setTop5000SteamId, deleteTop5000Player,
  getContentPage, upsertContentPage, deleteContentPage,
  uploadNewsImage, saveNews, deleteNews, publishNews,
  saveGlobalSettings,
  saveTestimonial, deleteTestimonial,
  getAllTournamentsAdmin, saveTournament, deleteTournament, setTournamentVisibility, uploadTournamentBanner,
  saveHofTournament, deleteHofTournament, publishHofTournament, uploadHofBanner,
  uploadBasherPages, saveBasherIssue, deleteBasherIssue, publishBasherIssue,
} from './actions';


type ActiveTab = 'news' | 'settings' | 'hof' | 'basher' | 'ranking' | 'top5000' | 'streamers' | 'testimonials' | 'tournaments' | 'pages' | null;

const TOURNAMENT_TAGS = ['Zapisy otwarte', 'Trwający', 'Zakończony'] as const;

interface NewsItem {
  id: number;
  title: string;
  content: string;
  category: string;
  created_at: string;
  status: string;
  image_url?: string | null;
}

interface HofTournamentRow {
  id: string;
  tournament_name: string;
  tournament_date: string;
  tournament_id: string;
  dotabuff_link: string;
  team_name: string;
  players: { name: string; friend_id?: number; is_substitute: boolean }[];
  created_at: string;
  status: string;
  image_url?: string | null;
  team_logo_url?: string | null;
}

interface TournamentRow {
  id: string;
  name: string;
  tag: string;
  description: string;
  href: string;
  image_url: string | null;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
}

interface TestimonialRow {
  id: string;
  name: string;
  avatar_url: string | null;
  headline: string;
  text: string;
  rating: number;
  created_at: string;
}

interface BasherIssue {
  id: string;
  issue_number: number;
  title: string;
  publish_date: string;
  pages: string[];
  status: string;
  link_url?: string | null;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

const slugify = (name: string) =>
  name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '.png';

const initialPlayers = () =>
  Array.from({ length: 6 }, (_, i) => ({
    name: '',
    friendId: '',
    isSubstitute: i === 5,
  }));

// ----------------------------------------------------------------
// Status badge component
// ----------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === 'published') {
    return (
      <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border font-sans text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_10px_rgba(52,211,153,0.15)]">
        Opublikowano
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border font-sans text-amber-400 bg-amber-500/10 border-amber-500/30 shadow-[0_0_8px_rgba(251,191,36,0.12)]">
      Szkic
    </span>
  );
}

// ----------------------------------------------------------------
// Page component
// ----------------------------------------------------------------

export default function AdminPage() {
  const router = useRouter();

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<ActiveTab>(null);

  // ── Unsaved changes ──
  const [dirty, setDirty] = useState(false);

  // beforeunload handler
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const switchTab = useCallback(
    (tab: ActiveTab) => {
      if (dirty && tab !== activeTab) {
        const ok = window.confirm(
          'Masz niezapisane zmiany. Czy na pewno chcesz opuścić stronę?',
        );
        if (!ok) return;
      }
      setDirty(false);
      setActiveTab((prev) => (prev === tab ? null : tab));
    },
    [dirty, activeTab],
  );

  // ── News state ──
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Turniej');
  const [content, setContent] = useState('');
  const [newsPublishing, setNewsPublishing] = useState<number | null>(null);
  const [newsImageFile, setNewsImageFile] = useState<File | null>(null);
  const [newsImagePreview, setNewsImagePreview] = useState<string | null>(null);

  // ── Settings state ──
  const [discordLink, setDiscordLink] = useState('https://discord.gg/ZxgmF7Kr4t');
  const [partnerLink, setPartnerLink] = useState('https://dreammachines.pl/pl/?utm_content=dota2');
  const [twitchLink, setTwitchLink] = useState('');
  const [youtubeLink, setYoutubeLink] = useState('');
  const [instagramLink, setInstagramLink] = useState('');
  const [fontFamily, setFontFamily] = useState('Oxanium');
  const [saveSettingsSuccess, setSaveSettingsSuccess] = useState(false);
  const [saveSettingsError, setSaveSettingsError] = useState<string | null>(null);

  // ── Hall of Fame state ──
  const [hofTournamentName, setHofTournamentName] = useState('');
  const [hofTeamName, setHofTeamName] = useState('');
  const [hofTournamentDate, setHofTournamentDate] = useState('');
  const [hofTournamentId, setHofTournamentId] = useState('');
  const [hofDotabuffLink, setHofDotabuffLink] = useState('');
  const [hofPlayers, setHofPlayers] = useState(initialPlayers);
  const [hofTournaments, setHofTournaments] = useState<HofTournamentRow[]>([]);
  const [hofLoading, setHofLoading] = useState(false);
  const [hofSaving, setHofSaving] = useState(false);
  const [hofSuccess, setHofSuccess] = useState(false);
  const [hofError, setHofError] = useState<string | null>(null);
  const [hofPublishing, setHofPublishing] = useState<string | null>(null);
  const [hofEditingId, setHofEditingId] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  // No upload UI for this anymore (team logos can no longer be added from the
  // admin panel) — kept read-only so editing an older tournament that already
  // has one doesn't wipe it out on save.
  const [teamLogoPreview, setTeamLogoPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ── Basher state ──
  const [basherIssueNumber, setBasherIssueNumber] = useState('');
  const [basherTitle, setBasherTitle] = useState('');
  const [basherPublishDate, setBasherPublishDate] = useState('');
  const [basherLinkUrl, setBasherLinkUrl] = useState('');
  const [basherFiles, setBasherFiles] = useState<File[]>([]);
  const [basherPreviews, setBasherPreviews] = useState<string[]>([]);
  const [basherIssues, setBasherIssues] = useState<BasherIssue[]>([]);
  const [basherLoading, setBasherLoading] = useState(false);
  const [basherSaving, setBasherSaving] = useState(false);
  const [basherSuccess, setBasherSuccess] = useState<string | false>(false);
  const [basherError, setBasherError] = useState<string | null>(null);
  const [basherPublishing, setBasherPublishing] = useState<string | null>(null);
  const [basherEditingId, setBasherEditingId] = useState<string | null>(null);

  // ── Ranking management state ──
  const [rankPlayers, setRankPlayers] = useState<{ id: string; steam_id: string; name: string; created_at: string }[]>([]);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankSearch, setRankSearch] = useState('');
  const [rankDeleting, setRankDeleting] = useState<string | null>(null);
  const [rankSuccess, setRankSuccess] = useState<string | null>(null);
  const [rankError, setRankError] = useState<string | null>(null);

  // ── Top-5000 SteamID assignment state ──
  const [top5000Players, setTop5000Players] = useState<{ id: string; name: string; source_name: string | null; leaderboard_rank: number | null; steam_id: string | null }[]>([]);
  const [top5000Loading, setTop5000Loading] = useState(false);
  const [top5000Search, setTop5000Search] = useState('');
  const [top5000Edits, setTop5000Edits] = useState<Record<string, string>>({});
  const [top5000Saving, setTop5000Saving] = useState<string | null>(null);
  const [top5000Deleting, setTop5000Deleting] = useState<string | null>(null);
  const [top5000Success, setTop5000Success] = useState<string | null>(null);
  const [top5000Error, setTop5000Error] = useState<string | null>(null);

  // ── Streamers state ──
  const [streamerNick, setStreamerNick] = useState('');
  const [streamerMotto, setStreamerMotto] = useState('');
  const [streamerUrl, setStreamerUrl] = useState('');
  const [streamers, setStreamers] = useState<{ id: string; nick: string; motto: string; stream_url: string; position: number }[]>([]);
  const [streamerSaving, setStreamerSaving] = useState(false);
  const [streamerError, setStreamerError] = useState<string | null>(null);
  const [streamerSuccess, setStreamerSuccess] = useState<string | null>(null);
  const [streamerDeleting, setStreamerDeleting] = useState<string | null>(null);
  const [streamerEditingId, setStreamerEditingId] = useState<string | null>(null);
  const [isSavingPositions, setIsSavingPositions] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // ── Testimonials state ──
  const [testimonials, setTestimonials] = useState<TestimonialRow[]>([]);
  const [testimonialNick, setTestimonialNick] = useState('');
  const [testimonialAvatarUrl, setTestimonialAvatarUrl] = useState('');
  const [testimonialHeadline, setTestimonialHeadline] = useState('');
  const [testimonialText, setTestimonialText] = useState('');
  const [testimonialRating, setTestimonialRating] = useState(5);
  const [testimonialEditingId, setTestimonialEditingId] = useState<string | null>(null);
  const [testimonialSaving, setTestimonialSaving] = useState(false);
  const [testimonialDeleting, setTestimonialDeleting] = useState<string | null>(null);
  const [testimonialSuccess, setTestimonialSuccess] = useState<string | null>(null);
  const [testimonialError, setTestimonialError] = useState<string | null>(null);

  // ── Tournaments ("Co jest grane?") state ──
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const [tournamentEditingId, setTournamentEditingId] = useState<string | null>(null);
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentTag, setTournamentTag] = useState<string>(TOURNAMENT_TAGS[0]);
  const [tournamentDescription, setTournamentDescription] = useState('');
  const [tournamentHref, setTournamentHref] = useState('');
  const [tournamentIsVisible, setTournamentIsVisible] = useState(true);
  const [tournamentSortOrder, setTournamentSortOrder] = useState(0);
  const [tournamentImageFile, setTournamentImageFile] = useState<File | null>(null);
  const [tournamentImagePreview, setTournamentImagePreview] = useState<string | null>(null);
  const [tournamentSaving, setTournamentSaving] = useState(false);
  const [tournamentDeleting, setTournamentDeleting] = useState<string | null>(null);
  const [tournamentTogglingId, setTournamentTogglingId] = useState<string | null>(null);
  const [tournamentSuccess, setTournamentSuccess] = useState<string | null>(null);
  const [tournamentError, setTournamentError] = useState<string | null>(null);

  // ── Content Pages state ──
  // One editor, one selected slug. This used to be three sidebar tabs with a
  // triplicated set of state hooks; the page list now comes from CONTENT_PAGES,
  // so adding a static page is one entry there plus its route folder.
  const [pageSlug, setPageSlug] = useState<ContentSlug>('rekrutacja');
  const [pageContent, setPageContent] = useState('');
  const [pageLoading, setPageLoading] = useState(false);
  const [pagesSaving, setPagesSaving] = useState(false);
  const [pagesSuccess, setPagesSuccess] = useState<string | null>(null);
  const [pagesError, setPagesError] = useState<string | null>(null);

  const resetTestimonialForm = () => {
    setTestimonialNick('');
    setTestimonialAvatarUrl('');
    setTestimonialHeadline('');
    setTestimonialText('');
    setTestimonialRating(5);
    setTestimonialEditingId(null);
  };

  const resetTournamentForm = () => {
    setTournamentEditingId(null);
    setTournamentName('');
    setTournamentTag(TOURNAMENT_TAGS[0]);
    setTournamentDescription('');
    setTournamentHref('');
    setTournamentIsVisible(true);
    setTournamentSortOrder(0);
    setTournamentImageFile(null);
    setTournamentImagePreview(null);
  };

  const resetStreamerForm = () => {
    setStreamerNick('');
    setStreamerMotto('');
    setStreamerUrl('');
    setStreamerEditingId(null);
  };

  const fetchTestimonials = async () => {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('testimonials')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error && data) {
      setTestimonials(data);
    }
  };

  const fetchTournaments = async () => {
    setTournamentLoading(true);
    const result = await getAllTournamentsAdmin();
    if (result.success) setTournaments(result.data as TournamentRow[]);
    setTournamentLoading(false);
  };

  // ── Content Pages CRUD ──

  const fetchContentPage = async (slug: string, setContent: (v: string) => void, setLoading: (v: boolean) => void) => {
    setLoading(true);
    const result = await getContentPage(slug);
    if (result.success && result.data) {
      setContent(result.data.content);
    }
    setLoading(false);
  };

  const handleSaveContentPage = async (slug: string, content: string) => {
    setPagesSaving(true);
    setPagesSuccess(null);
    setPagesError(null);
    try {
      const result = await upsertContentPage(slug, content);
      if (!result.success) throw new Error(result.error);
      setPagesSuccess(`Strona "${slug}" została zaktualizowana.`);
      toast.success(`Strona "${slug}" została zaktualizowana.`);
      setTimeout(() => setPagesSuccess(null), 3000);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Wystąpił błąd podczas zapisu strony.';
      setPagesError(errorMsg);
      toast.error(errorMsg);
      setTimeout(() => setPagesError(null), 3000);
    }
    setPagesSaving(false);
  };

  const handleSaveTestimonial = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestimonialSaving(true);
    setTestimonialSuccess(null);
    setTestimonialError(null);

    try {
      const data = {
        name: testimonialNick,
        avatar_url: testimonialAvatarUrl || null,
        headline: testimonialHeadline,
        text: testimonialText,
        rating: testimonialRating,
      };
      const result = await saveTestimonial(testimonialEditingId, data);
      if (!result.success) throw new Error(result.error);

      if (testimonialEditingId) {
        setTestimonialSuccess('Opinia została zaktualizowana.');
        toast.success('Opinia została zaktualizowana.');
      } else {
        setTestimonialSuccess('Opinia została dodana.');
        toast.success('Opinia została dodana.');
      }
      resetTestimonialForm();
      setDirty(false);
      await fetchTestimonials();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Wystąpił błąd.';
      setTestimonialError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setTestimonialSaving(false);
    }
  };

  const handleDeleteTestimonial = async (id: string) => {
    if (!window.confirm('Na pewno usunąć tę opinię?')) return;
    setTestimonialDeleting(id);
    const result = await deleteTestimonial(id);
    if (!result.success) {
      setTestimonialError(result.error);
      toast.error(result.error);
    } else {
      toast.success('Opinia została usunięta.');
      await fetchTestimonials();
    }
    setTestimonialDeleting(null);
  };

  // ── Tournaments ("Co jest grane?") CRUD ──

  const handleSaveTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    setTournamentSaving(true);
    setTournamentSuccess(null);
    setTournamentError(null);

    try {
      let imageUrl: string | null = tournamentImagePreview ?? null;

      if (tournamentImageFile) {
        const fileName = slugify(tournamentName.trim());
        const fd = new FormData();
        fd.append('file', tournamentImageFile);
        fd.append('fileName', fileName);

        const uploadResult = await uploadTournamentBanner(fd);
        if (!uploadResult.success) throw new Error(uploadResult.error);
        imageUrl = uploadResult.url;
      }

      const payload = {
        name: tournamentName.trim(),
        tag: tournamentTag,
        description: tournamentDescription.trim(),
        href: tournamentHref.trim(),
        image_url: imageUrl,
        is_visible: tournamentIsVisible,
        sort_order: tournamentSortOrder,
      };

      const result = await saveTournament(tournamentEditingId, payload);
      if (!result.success) throw new Error(result.error);

      if (tournamentEditingId) {
        setTournamentSuccess('Turniej został zaktualizowany.');
        toast.success('Turniej został zaktualizowany.');
      } else {
        setTournamentSuccess('Turniej został dodany.');
        toast.success('Turniej został dodany.');
      }

      resetTournamentForm();
      setDirty(false);
      setTimeout(() => setTournamentSuccess(null), 3000);
      await fetchTournaments();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Wystąpił błąd podczas zapisywania turnieju.';
      setTournamentError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setTournamentSaving(false);
    }
  };

  const handleTournamentEditClick = (t: TournamentRow) => {
    setTournamentEditingId(t.id);
    setTournamentName(t.name);
    setTournamentTag(t.tag);
    setTournamentDescription(t.description);
    setTournamentHref(t.href);
    setTournamentIsVisible(t.is_visible);
    setTournamentSortOrder(t.sort_order);
    setTournamentImageFile(null);
    setTournamentImagePreview(t.image_url);
    setActiveTab('tournaments');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteTournament = async (id: string) => {
    if (!window.confirm('Na pewno usunąć ten turniej?')) return;
    setTournamentDeleting(id);
    const result = await deleteTournament(id);
    if (!result.success) {
      toast.error(result.error);
    } else {
      toast.success('Turniej został usunięty.');
      await fetchTournaments();
    }
    setTournamentDeleting(null);
  };

  const handleToggleTournamentVisibility = async (t: TournamentRow) => {
    setTournamentTogglingId(t.id);
    const result = await setTournamentVisibility(t.id, !t.is_visible);
    if (!result.success) {
      toast.error(result.error);
    } else {
      await fetchTournaments();
    }
    setTournamentTogglingId(null);
  };

  // ── Data fetching ──

  const fetchNews = async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .neq('category', 'SystemSettings')
      .order('created_at', { ascending: false });
    if (!error && data) {
      // No ContentPage filter needed any more — the static pages moved to their
      // own `content_pages` table in migration 025.
      setNews(data as NewsItem[]);
    }
    setLoading(false);
  };

  const fetchSettings = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .eq('category', 'SystemSettings')
        .eq('title', 'global_settings')
        .maybeSingle();
      if (!error && data && data.content) {
        const val = JSON.parse(data.content);
        if (val.discord_link) setDiscordLink(val.discord_link);
        if (val.partner_link) setPartnerLink(val.partner_link);
        if (val.twitch_link) setTwitchLink(val.twitch_link);
        if (val.youtube_link) setYoutubeLink(val.youtube_link);
        if (val.instagram_link) setInstagramLink(val.instagram_link);
        if (val.font_family) setFontFamily(val.font_family);
      }
    } catch (err) {
      console.error('Błąd pobierania ustawień:', err);
    }
  };

  const fetchHofTournaments = async () => {
    setHofLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('hall_of_fame_tournaments')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setHofTournaments(data as HofTournamentRow[]);
    setHofLoading(false);
  };

  const fetchBasherIssues = async () => {
    setBasherLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('basher_issues')
      .select('*')
      .order('issue_number', { ascending: false });
    if (!error && data) setBasherIssues(data as BasherIssue[]);
    setBasherLoading(false);
  };

  const fetchRankPlayers = async () => {
    setRankLoading(true);
    const result = await getRankPlayers();
    if (result.success) {
      setRankPlayers(result.data);
    }
    setRankLoading(false);
  };

  const handleDeleteRankPlayer = async (id: string) => {
    if (!window.confirm('Czy na pewno chcesz usunąć tego gracza z rankingu?')) return;
    setRankDeleting(id);
    setRankError(null);
    setRankSuccess(null);
    try {
      const result = await deleteRankPlayer(id);
      if (!result.success) throw new Error(result.error);
      setRankPlayers((prev) => prev.filter((p) => p.steam_id !== id));
      setRankSuccess('Gracz został usunięty z rankingu.');
      toast.success('Gracz został usunięty z rankingu.');
      router.refresh();
      setTimeout(() => setRankSuccess(null), 3000);
    } catch (err: unknown) {
      console.error('Błąd usuwania gracza:', err);
      const errorMsg = err instanceof Error ? err.message : 'Wystąpił błąd podczas usuwania gracza.';
      setRankError(errorMsg);
      toast.error(errorMsg);
      setTimeout(() => setRankError(null), 3000);
    }
    setRankDeleting(null);
  };

  const fetchTop5000Players = async () => {
    setTop5000Loading(true);
    const result = await getTop5000Players();
    if (result.success) {
      setTop5000Players(result.data);
      setTop5000Edits(Object.fromEntries(result.data.map((p) => [p.id, p.steam_id ?? ''])));
    }
    setTop5000Loading(false);
  };

  const handleSaveTop5000SteamId = async (id: string) => {
    const raw = (top5000Edits[id] ?? '').trim();
    setTop5000Saving(id);
    setTop5000Error(null);
    setTop5000Success(null);
    try {
      const result = await setTop5000SteamId(id, raw === '' ? null : raw);
      if (!result.success) throw new Error(result.error);
      const savedValue = raw === '' ? null : raw;
      setTop5000Players((prev) => prev.map((p) => (p.id === id ? { ...p, steam_id: savedValue } : p)));
      setTop5000Success('SteamID zapisany.');
      toast.success('SteamID zapisany.');
      setTimeout(() => setTop5000Success(null), 3000);
    } catch (err: unknown) {
      console.error('Błąd zapisu SteamID:', err);
      const errorMsg = err instanceof Error ? err.message : 'Wystąpił błąd podczas zapisu SteamID.';
      setTop5000Error(errorMsg);
      toast.error(errorMsg);
      setTimeout(() => setTop5000Error(null), 4000);
    }
    setTop5000Saving(null);
  };

  const handleDeleteTop5000Player = async (id: string, name: string) => {
    if (!window.confirm(`Usunąć "${name}" z listy top 5000? Może wrócić przy kolejnym wygenerowaniu pliku JSON — to nic, po prostu zniknie z bieżącej listy.`)) return;
    setTop5000Deleting(id);
    setTop5000Error(null);
    setTop5000Success(null);
    try {
      const result = await deleteTop5000Player(id);
      if (!result.success) throw new Error(result.error);
      setTop5000Players((prev) => prev.filter((p) => p.id !== id));
      setTop5000Edits((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setTop5000Success('Gracz usunięty z listy.');
      toast.success('Gracz usunięty z listy.');
      setTimeout(() => setTop5000Success(null), 3000);
    } catch (err: unknown) {
      console.error('Błąd usuwania gracza z top 5000:', err);
      const errorMsg = err instanceof Error ? err.message : 'Wystąpił błąd podczas usuwania gracza.';
      setTop5000Error(errorMsg);
      toast.error(errorMsg);
      setTimeout(() => setTop5000Error(null), 4000);
    }
    setTop5000Deleting(null);
  };

  // ── Streamers CRUD ──

  const fetchStreamers = async () => {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('streamers')
      .select('*')
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (!error && data) setStreamers(data);
  };

  const handleStreamerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!streamerNick.trim() || !streamerUrl.trim()) return;

    setStreamerSaving(true);
    setStreamerError(null);
    setStreamerSuccess(null);

    const data = {
      nick: streamerNick.trim(),
      motto: streamerMotto.trim(),
      stream_url: streamerUrl.trim(),
    };

    if (streamerEditingId) {
      const result = await updateStreamer(streamerEditingId, data);
      if (!result.success) {
        console.error('Błąd aktualizacji streamera:', result.error);
        setStreamerError(result.error);
        toast.error(result.error);
        setStreamerSaving(false);
        return;
      }
      setStreamerSuccess('Streamer został zaktualizowany!');
      toast.success('Streamer został zaktualizowany!');
    } else {
      const result = await addStreamer({
        ...data,
        position: streamers.length,
      });
      if (!result.success) {
        console.error('Błąd zapisu streamera:', result.error);
        setStreamerError(result.error);
        toast.error(result.error);
        setStreamerSaving(false);
        return;
      }
      setStreamerSuccess('Streamer został dodany!');
      toast.success('Streamer został dodany!');
    }

    setDirty(false);
    setTimeout(() => setStreamerSuccess(null), 3000);
    resetStreamerForm();
    fetchStreamers();
    setStreamerSaving(false);
  };

  const handleDeleteStreamer = async (id: string) => {
    if (!window.confirm('Na pewno chcesz usunąć tego streamera?')) return;
    setStreamerDeleting(id);
    const result = await deleteStreamer(id);
    if (!result.success) {
      console.error('Błąd usuwania streamera:', result.error);
      fetchStreamers();
    } else {
      setStreamers((prev) => prev.filter((s) => s.id !== id));
    }
    setStreamerDeleting(null);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const updated = [...streamers];
    const [removed] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, removed);
    updated.forEach((item, idx) => { item.position = idx; });

    setDraggedIndex(index);
    setStreamers(updated);
    setDirty(true);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSaveStreamerPositions = async () => {
  setIsSavingPositions(true);
  try {
    const updates = streamers.map((streamer, index) => ({
      id: streamer.id,
      position: index,
    }));

    const result = await updateStreamerPositions(updates);

    if (!result.success) {
      throw new Error(result.error);
    }

    const syncedStreamers = streamers.map((s, index) => ({ ...s, position: index }));
    setStreamers(syncedStreamers);

    setDirty(false);
    toast.success('Kolejność została pomyślnie zapisana!');
  } catch (err) {
    console.error('Błąd zapisu kolejności:', err);
    toast.error('Wystąpił błąd podczas zapisywania do bazy.');
  } finally {
    setIsSavingPositions(false);
  }
};

  useEffect(() => {
    const init = async () => {
      await fetchNews();
      await fetchSettings();
      await fetchHofTournaments();
      await fetchBasherIssues();
      await fetchRankPlayers();
      await fetchTop5000Players();
      await fetchStreamers();
      await fetchTestimonials();
      await fetchTournaments();
    };
    init();
  }, []);

  // ── News CRUD ──

  const handleSaveNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !stripHtml(content)) return;

    let imageUrl: string | null = null;

    // Upload image via server action (bypasses RLS)
    if (newsImageFile) {
      const formData = new FormData();
      formData.append('file', newsImageFile);
      const uploadResult = await uploadNewsImage(formData);
      if (uploadResult.success) {
        imageUrl = uploadResult.publicUrl;
      } else {
        console.error('Błąd przesyłania obrazka:', uploadResult.error);
      }
    }

    const payload: { title: string; category: string; content: string; image_url?: string } = { title, category, content };
    if (imageUrl) payload.image_url = imageUrl;

    const result = await saveNews(editingId, payload);
    if (!result.success) {
      console.error('Błąd zapisu newsa:', result.error);
      toast.error(result.error);
      return;
    }

    resetNewsForm();
    setDirty(false);
    fetchNews();
  };

  const handleDeleteNews = async (id: number) => {
    if (!window.confirm('Na pewno chcesz usunąć ten wpis?')) return;
    const result = await deleteNews(id);
    if (!result.success) toast.error(result.error);
    fetchNews();
  };

  const handlePublishNews = async (id: number) => {
    setNewsPublishing(id);
    const result = await publishNews(id);
    if (!result.success) {
      console.error('Błąd publikacji newsa:', result.error);
    }
    setNewsPublishing(null);
    fetchNews();
  };

  const handleEditClick = (item: NewsItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setCategory(item.category);
    setContent(item.content);
    setNewsImageFile(null);
    setNewsImagePreview(item.image_url ?? null);
    setActiveTab('news');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetNewsForm = () => {
    setEditingId(null);
    setTitle('');
    setCategory('Turniej');
    setContent('');
    setNewsImageFile(null);
    setNewsImagePreview(null);
  };

  // ── Settings ──

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSettingsError(null);
    setSaveSettingsSuccess(false);

    try {
      const value = {
        discord_link: discordLink,
        partner_link: partnerLink,
        twitch_link: twitchLink,
        youtube_link: youtubeLink,
        instagram_link: instagramLink,
        font_family: fontFamily,
      };

      const result = await saveGlobalSettings(value);
      if (!result.success) throw new Error(result.error);

      setSaveSettingsSuccess(true);
      toast.success('Ustawienia zostały zapisane!');
      setDirty(false);
      setTimeout(() => setSaveSettingsSuccess(false), 3000);
    } catch (err: unknown) {
      console.error('Błąd zapisu ustawień:', err);
      const msg = err instanceof Error ? err.message : String(err) || 'Wystąpił błąd podczas zapisywania do bazy danych.';
      setSaveSettingsError(msg);
      toast.error(msg);
    }
  };

  // ── Hall of Fame ──

  const resetHofForm = () => {
    setHofEditingId(null);
    setHofTournamentName('');
    setHofTeamName('');
    setHofTournamentDate('');
    setHofTournamentId('');
    setHofDotabuffLink('');
    setHofPlayers(initialPlayers());
    setHofSuccess(false);
    setHofError(null);
    setBannerFile(null);
    setBannerPreview(null);
    setTeamLogoPreview(null);
  };

  const handleHofPlayerChange = (
    index: number,
    field: 'name' | 'friendId',
    value: string,
  ) => {
    setHofPlayers((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  };

  const handleHofSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHofSaving(true);
    setIsUploading(true);
    setHofError(null);
    setHofSuccess(false);

    try {
      let imageUrl: string | null = bannerPreview ?? null;

      // Upload banner via server action (bypasses RLS)
      if (bannerFile) {
        const fileName = slugify(hofTournamentName.trim());
        const fd = new FormData();
        fd.append('file', bannerFile);
        fd.append('fileName', fileName);

        const uploadResult = await uploadHofBanner(fd);
        if (!uploadResult.success) throw new Error(uploadResult.error);
        imageUrl = uploadResult.url;
      }

      // Not user-settable anymore — carries through whatever an older
      // tournament already had so editing it doesn't wipe the logo out.
      const teamLogoUrl: string | null = teamLogoPreview ?? null;

      const playersJson = hofPlayers
        .filter((p) => p.name.trim() !== '')
        .map((p) => ({
          name: p.name.trim(),
          ...(p.friendId.trim() ? { friend_id: Number(p.friendId.trim()) } : {}),
          is_substitute: p.isSubstitute,
        }));

      const payload = {
        tournament_name: hofTournamentName.trim(),
        tournament_date: hofTournamentDate.trim(),
        tournament_id: hofTournamentId.trim(),
        dotabuff_link: hofDotabuffLink.trim(),
        team_name: hofTeamName.trim(),
        players: playersJson,
        image_url: imageUrl,
        team_logo_url: teamLogoUrl,
      };

      const result = await saveHofTournament(hofEditingId, payload);
      if (!result.success) throw new Error(result.error);

      setHofSuccess(true);
      toast.success(hofEditingId ? 'Turniej został zaktualizowany!' : 'Turniej został zapisany jako szkic!');
      setDirty(false);
      setTimeout(() => setHofSuccess(false), 3000);
      resetHofForm();
      fetchHofTournaments();
    } catch (err: unknown) {
      console.error('Błąd zapisu turnieju:', err);
      const msg = err instanceof Error ? err.message : String(err) || 'Wystąpił błąd podczas zapisywania.';
      setHofError(msg);
      toast.error(msg);
    } finally {
      setHofSaving(false);
      setIsUploading(false);
    }
  };

  const handleHofEditClick = (item: HofTournamentRow) => {
    setHofEditingId(item.id);
    setHofTournamentName(item.tournament_name);
    setHofTeamName(item.team_name || '');
    setHofTournamentDate(item.tournament_date);
    setHofTournamentId(item.tournament_id);
    setHofDotabuffLink(item.dotabuff_link);
    setHofPlayers(
      Array.from({ length: 6 }, (_, i) => {
        const db = item.players[i];
        return {
          name: db?.name || '',
          friendId: db?.friend_id ? String(db.friend_id) : '',
          isSubstitute: i === 5,
        };
      }),
    );
    setBannerPreview(item.image_url ?? null);
    setBannerFile(null);
    setTeamLogoPreview(item.team_logo_url ?? null);
    setActiveTab('hof');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleHofDelete = async (id: string) => {
    if (!window.confirm('Na pewno chcesz usunąć ten turniej?')) return;
    const result = await deleteHofTournament(id);
    if (!result.success) console.error('Błąd usuwania turnieju:', result.error);
    fetchHofTournaments();
  };

  const handlePublishHof = async (id: string) => {
    setHofPublishing(id);
    const result = await publishHofTournament(id);
    if (!result.success) {
      console.error('Błąd publikacji turnieju:', result.error);
    }
    setHofPublishing(null);
    fetchHofTournaments();
  };

  // ── Basher ──

  const resetBasherForm = () => {
    setBasherEditingId(null);
    setBasherIssueNumber('');
    setBasherTitle('');
    setBasherPublishDate('');
    setBasherLinkUrl('');
    setBasherFiles([]);
    setBasherPreviews([]);
    setBasherSuccess(false);
    setBasherError(null);
    setBasherSaving(false);
  };

  const handleBasherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBasherSaving(true);
    setBasherError(null);
    setBasherSuccess(false);

    try {
      const issueNumber = Number(basherIssueNumber.trim());
      if (issueNumber < 1) {
        setBasherError('Numer wydania musi być liczbą dodatnią.');
        toast.error('Numer wydania musi być liczbą dodatnią.');
        setBasherSaving(false);
        return;
      }

      let pagesArray: string[];

      if (basherFiles.length > 0) {
        // Sortuj pliki alfabetycznie po nazwie
        const sortedFiles = [...basherFiles].sort((a, b) =>
          a.name.localeCompare(b.name),
        );

        const fd = new FormData();
        fd.append('issueNumber', String(issueNumber));
        sortedFiles.forEach((file) => fd.append('files', file));

        const uploadResult = await uploadBasherPages(fd);
        if (!uploadResult.success) throw new Error(uploadResult.error);
        pagesArray = uploadResult.urls;
      } else {
        // Bez nowych plików — używamy istniejących URL-i (tryb edycji)
        pagesArray = basherPreviews.filter(Boolean);
      }

      if (pagesArray.length === 0) {
        setBasherError('Dodaj przynajmniej jedną stronę (plik graficzny).');
        toast.error('Dodaj przynajmniej jedną stronę (plik graficzny).');
        setBasherSaving(false);
        return;
      }

      const payload = {
        issue_number: issueNumber,
        title: basherTitle.trim(),
        publish_date: basherPublishDate.trim(),
        pages: pagesArray,
        link_url: basherLinkUrl.trim() || null,
      };

      const wasEditing = !!basherEditingId;

      const result = await saveBasherIssue(basherEditingId, payload);
      if (!result.success) throw new Error(result.error);

      setBasherSuccess(wasEditing ? 'updated' : 'inserted');
      toast.success(wasEditing ? 'Wydanie zostało zaktualizowane!' : 'Wydanie zostało zapisane jako szkic!');
      setDirty(false);
      setTimeout(() => setBasherSuccess(false), 3000);
      resetBasherForm();
      fetchBasherIssues();
    } catch (err: unknown) {
      console.error('Błąd zapisania magazynu:', err);
      const msg = err instanceof Error ? err.message : String(err) || 'Wystąpił błąd podczas zapisywania.';
      setBasherError(msg);
      toast.error(msg);
    } finally {
      setBasherSaving(false);
    }
  };

  const handleBasherDelete = async (id: string) => {
    if (!window.confirm('Na pewno chcesz usunąć to wydanie?')) return;
    setBasherIssues((prev) => prev.filter((i) => i.id !== id));
    const result = await deleteBasherIssue(id);
    if (!result.success) {
      console.error('Błąd usuwania magazynu:', result.error);
      fetchBasherIssues();
    }
  };

  const handlePublishBasher = async (id: string) => {
    // Optimistic update
    setBasherIssues((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: 'published' } : i)),
    );
    setBasherPublishing(id);
    const result = await publishBasherIssue(id);
    if (!result.success) {
      console.error('Błąd publikacji magazynu:', result.error);
      fetchBasherIssues();
    }
    setBasherPublishing(null);
  };

  const handleBasherEditClick = (item: BasherIssue) => {
    setBasherEditingId(item.id);
    setBasherIssueNumber(String(item.issue_number));
    setBasherTitle(item.title);
    setBasherPublishDate(item.publish_date);
    setBasherLinkUrl(item.link_url ?? '');
    setBasherFiles([]);
    setBasherPreviews(item.pages.length > 0 ? item.pages : []);
    setActiveTab('basher');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const basherInputRef = useRef<HTMLInputElement>(null);

  const handleBasherFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    // Sortuj pliki alfabetycznie po nazwie
    const sorted = Array.from(fileList).sort((a, b) => a.name.localeCompare(b.name));

    // Zwolnij poprzednie blob URL-e
    basherPreviews.forEach((url) => {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    });

    setBasherFiles(sorted);

    // Generuj preview z blob URL-i
    const previews = sorted.map((file) => URL.createObjectURL(file));
    setBasherPreviews(previews);
    setDirty(true);
  };

  const handleRemoveBasherFile = (index: number) => {
    const url = basherPreviews[index];
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);

    const newFiles = basherFiles.filter((_, i) => i !== index);
    const newPreviews = basherPreviews.filter((_, i) => i !== index);
    setBasherFiles(newFiles);
    setBasherPreviews(newPreviews);
  };

  // ── Render ──

  const sidebarItems: { tab: ActiveTab; icon: typeof Newspaper; label: string; plus?: boolean }[] = [
    { tab: 'news', icon: Newspaper, label: 'Newsy' },
    { tab: 'settings', icon: Settings, label: 'Ustawienia' },
    { tab: 'hof', icon: Trophy, label: 'Hall of Fame' },
    { tab: 'tournaments', icon: Swords, label: 'Co jest grane?' },
    { tab: 'basher', icon: BookOpen, label: 'Basher' },
    { tab: 'ranking', icon: Users, label: 'Ranking' },
    { tab: 'top5000', icon: ListOrdered, label: 'Ranking 5k' },
    { tab: 'streamers', icon: Radio, label: 'Streamerzy' },
    { tab: 'testimonials', icon: MessageSquare, label: 'Opinie' },
    { tab: 'pages', icon: FileText, label: 'Strony' },
  ];

  return (
    <main className="relative min-h-screen bg-[#050505] text-slate-100 overflow-x-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
        <ClientLightPillar
          topColor="#ff0000" bottomColor="#ff5500" intensity={0.7}
          rotationSpeed={0.2} glowAmount={0.002} pillarWidth={2.5}
          pillarHeight={0.3} noiseIntensity={0.5} pillarRotation={90}
          interactive={false} mixBlendMode="screen"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505]" />
      </div>

      <Navbar />

      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-8 pb-20">
        <div className="flex gap-8 items-start">
          {/* ── Sidebar ── */}
          <aside className="w-56 shrink-0 sticky top-6">
            <div className="mb-6 pl-3">
              <h1 className="text-3xl font-extrabold tracking-tight mb-1 text-white">Admin</h1>
              <p className="text-slate-600 text-xs leading-relaxed">
                Zarządzaj treścią i ustawieniami
              </p>
            </div>
            <nav className="flex flex-col gap-1">
              {sidebarItems.map(({ tab, icon: Icon, label }) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      if (tab === 'news') {
                        if (activeTab === 'news' && !editingId) {
                          switchTab(null);
                        } else {
                          switchTab('news');
                          if (editingId) {
                            setEditingId(null);
                            setTitle('');
                            setCategory('Turniej');
                            setContent('');
                          }
                        }
                      } else {
                        switchTab(tab);
                      }
                    }}
                    className={`group relative flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-red-600/15 text-red-400 border border-red-500/25 shadow-[inset_0_1px_0_rgba(239,68,68,0.1)]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-red-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                    <span className="truncate">{label}</span>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-red-500 rounded-full shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Inhouse is its own section rather than a tab: it has sub-pages
                (moderacja, harmonogram, pula botów, metryki) that don't fit a
                panel here, and it reads Firestore rather than Supabase. It sits
                in the same list so it is findable from the same place.
                Inhouse FAQ is a direct link rather than nested one click behind
                "Inhouse" — it's Supabase-backed like the tabs above, not part
                of the Firestore subsystem, so there's no reason to bury it. */}
            <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-col gap-1">
              <Link
                href="/admin/inhouse"
                className="group relative flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm
                           font-semibold text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]
                           border border-transparent transition-all duration-150"
              >
                <Gamepad2 className="w-4 h-4 shrink-0 text-slate-500 group-hover:text-slate-300" />
                <span className="truncate">Inhouse</span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0 text-slate-600 group-hover:text-slate-400" />
              </Link>
              <Link
                href="/admin/inhouse/faq"
                className="group relative flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm
                           font-semibold text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]
                           border border-transparent transition-all duration-150"
              >
                <HelpCircle className="w-4 h-4 shrink-0 text-slate-500 group-hover:text-slate-300" />
                <span className="truncate">Inhouse FAQ</span>
                <ChevronRight className="w-4 h-4 ml-auto shrink-0 text-slate-600 group-hover:text-slate-400" />
              </Link>
            </div>
          </aside>

          {/* ── Content ── */}
          <div className="flex-1 min-w-0">

        {/* ================================================================ */}
        {/* SETTINGS                                                          */}
        {/* ================================================================ */}
        {activeTab === 'settings' && (
          <div className="mb-10 bg-slate-900/40 border border-slate-700 rounded-3xl p-6 lg:p-8 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-200">
                <Settings className="w-5 h-5 text-red-500" /> Ustawienia dodatkowe
              </h2>
              <button
                type="button"
                onClick={() => { resetStreamerForm(); switchTab(null); }}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} noValidate className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Link zaproszenia Discord
                </label>
                <input
                  type="url" required value={discordLink}
                  onChange={(e) => { setDiscordLink(e.target.value); setDirty(true); }}
                  placeholder="https://discord.gg/..."
                  className="w-full max-w-xl bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Link partnera (Dream Machines)
                </label>
                <input
                  type="url" value={partnerLink}
                  onChange={(e) => { setPartnerLink(e.target.value); setDirty(true); }}
                  placeholder="https://dreammachines.pl/..."
                  className="w-full max-w-xl bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Link do Twitcha
                </label>
                <input
                  type="url" value={twitchLink}
                  onChange={(e) => { setTwitchLink(e.target.value); setDirty(true); }}
                  placeholder="https://www.twitch.tv/..."
                  className="w-full max-w-xl bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Link do YouTube
                </label>
                <input
                  type="url" value={youtubeLink}
                  onChange={(e) => { setYoutubeLink(e.target.value); setDirty(true); }}
                  placeholder="https://www.youtube.com/..."
                  className="w-full max-w-xl bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Link do Instagrama
                </label>
                <input
                  type="url" value={instagramLink}
                  onChange={(e) => { setInstagramLink(e.target.value); setDirty(true); }}
                  placeholder="https://www.instagram.com/..."
                  className="w-full max-w-xl bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div className="border-t border-white/[0.07] pt-6">
                <h3 className="text-lg font-bold text-slate-300 mb-4">Czcionka serwisu</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Wybierz aktywną czcionkę
                  </label>
                  <div className="relative max-w-md">
                    <select
                      value={fontFamily}
                      onChange={(e) => { setFontFamily(e.target.value); setDirty(true); }}
                      className="w-full appearance-none bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all pr-9"
                    >
                      <option value="Oxanium">Oxanium</option>
                      <option value="Exo 2">Exo 2</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              </div>

              {saveSettingsSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-3 rounded-xl">
                  Ustawienia zostały zapisane!
                </div>
              )}
              {saveSettingsError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-4 rounded-xl">
                  <p className="font-bold">Błąd zapisu: {saveSettingsError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-3 border-t border-white/[0.07]">
                <button
                  type="submit"
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-xl transition-all"
                >
                  <Save className="w-4 h-4" /> Zapisz ustawienia
                </button>
                <button
                  type="button"
                  onClick={() => switchTab(null)}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-6 rounded-xl transition-all"
                >
                  <X className="w-4 h-4" /> Zamknij
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ================================================================ */}
        {/* HALL OF FAME                                                      */}
        {/* ================================================================ */}
        {activeTab === 'hof' && (
          <div className="mb-10 bg-slate-900/40 border border-slate-700 rounded-3xl p-6 lg:p-8 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-200">
                <Trophy className="w-5 h-5 text-amber-500" /> {hofEditingId ? 'Edytuj zwycięzców' : 'Dodaj zwycięzców'}
              </h2>
              <button
                type="button"
                onClick={() => switchTab(null)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleHofSubmit} noValidate className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Nazwa turnieju
                  </label>
                  <input
                    type="text" required value={hofTournamentName}
                    onChange={(e) => { setHofTournamentName(e.target.value); setDirty(true); }}
                    placeholder="PDL Season 1: Winter Classic 2024"
                    className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Nazwa drużyny
                  </label>
                  <input
                    type="text" value={hofTeamName}
                    onChange={(e) => { setHofTeamName(e.target.value); setDirty(true); }}
                    placeholder="Team Liquid, OG, ..."
                    className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Data turnieju
                  </label>
                  <input
                    type="date" value={hofTournamentDate}
                    onChange={(e) => { setHofTournamentDate(e.target.value); setDirty(true); }}
                    className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    ID turnieju (Dotabuff)
                  </label>
                  <input
                    type="text" value={hofTournamentId}
                    onChange={(e) => { setHofTournamentId(e.target.value); setDirty(true); }}
                    placeholder="np. 12345"
                    className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Link Dotabuff (opcjonalnie)
                </label>
                <input
                  type="url" value={hofDotabuffLink}
                  onChange={(e) => { setHofDotabuffLink(e.target.value); setDirty(true); }}
                  placeholder="https://www.dotabuff.com/esports/tournaments/..."
                  className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div className="border-t border-white/[0.07] pt-6">
                <h3 className="text-lg font-bold text-slate-300 mb-4">Baner turnieju</h3>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="relative flex items-center justify-center border border-dashed border-white/10 hover:border-amber-500/50 rounded-xl py-8 px-8 bg-[#181a20] transition-colors cursor-pointer w-48 h-32">
                    <input
                      type="file" accept="image/png"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setBannerFile(file);
                        if (file) {
                          setBannerPreview(URL.createObjectURL(file));
                        } else {
                          setBannerPreview(null);
                        }
                        setDirty(true);
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="text-center pointer-events-none">
                      <Upload className="w-6 h-6 text-slate-500 mx-auto mb-2" />
                      <span className="text-xs font-bold text-slate-400">Wybierz plik</span>
                      <span className="block text-[10px] text-slate-600 mt-1">PNG</span>
                    </div>
                  </div>
                  {bannerPreview && (
                    <div className="relative w-48 h-32 rounded-xl overflow-hidden border border-white/10">
                      <img
                        src={bannerPreview}
                        alt="Podgląd banera"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setBannerFile(null);
                          setBannerPreview(null);
                        }}
                        className="absolute top-1 right-1 bg-black/70 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-white/[0.07] pt-6">
                <h3 className="text-lg font-bold text-slate-300 mb-4">Zawodnicy</h3>
                <div className="space-y-3">
                  {hofPlayers.map((player, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-3 ${
                        player.isSubstitute
                          ? 'bg-amber-500/5 border border-amber-500/10 rounded-xl p-3'
                          : ''
                      }`}
                    >
                      <span className="text-xs font-bold text-slate-500 w-24 flex-shrink-0">
                        {player.isSubstitute ? 'Rezerwowy' : `Gracz ${index + 1}`}
                      </span>
                      <input
                        type="text" required={!player.isSubstitute} value={player.name}
                        onChange={(e) => {
                          handleHofPlayerChange(index, 'name', e.target.value);
                          setDirty(true);
                        }}
                        placeholder="Nick"
                        className="flex-1 bg-[#181a20] border border-white/10 rounded-xl px-3 py-2.5 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all text-sm"
                      />
                      <input
                        type="text" value={player.friendId}
                        onChange={(e) => {
                          handleHofPlayerChange(index, 'friendId', e.target.value);
                          setDirty(true);
                        }}
                        placeholder="Dota Friend ID (opcjonalne)"
                        className="flex-1 bg-[#181a20] border border-white/10 rounded-xl px-3 py-2.5 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {hofSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-3 rounded-xl">
                  {hofEditingId ? 'Turniej został zaktualizowany!' : 'Turniej został zapisany jako szkic!'}
                </div>
              )}
              {hofError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-4 rounded-xl">
                  <p className="font-bold">Błąd zapisu: {hofError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-3 border-t border-white/[0.07]">
                <button
                  type="submit" disabled={hofSaving || isUploading}
                  className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-600/50 text-white font-bold py-3 px-6 rounded-xl transition-all"
                >
                  {hofSaving || isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {isUploading ? 'Przesyłanie banera...' : 'Zapisywanie...'}
                    </>
                  ) : hofEditingId ? (
                    <><Save className="w-4 h-4" /> Zapisz zmiany</>
                  ) : (
                    <><Save className="w-4 h-4" /> Zapisz turniej (Szkic)</>
                  )}
                </button>
                {hofEditingId ? (
                  <button
                    type="button"
                    onClick={resetHofForm}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-6 rounded-xl transition-all"
                  >
                    <X className="w-4 h-4" /> Anuluj edycję
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => switchTab(null)}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-6 rounded-xl transition-all"
                  >
                    <X className="w-4 h-4" /> Zamknij
                  </button>
                )}
              </div>
            </form>

            {/* Existing tournaments list */}
            <div className="mt-8 border-t border-white/[0.07] pt-6">
              <h3 className="text-lg font-bold text-slate-300 mb-4 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                Zapisane turnieje
              </h3>

              {hofLoading ? (
                <div className="flex items-center gap-3 text-slate-500 py-6">
                  <div className="w-5 h-5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                  Ładowanie...
                </div>
              ) : hofTournaments.length === 0 ? (
                <div className="bg-slate-900/20 border border-white/5 rounded-2xl p-8 text-center text-slate-500">
                  Brak zapisanych turniejów.
                </div>
              ) : (
                <div className="space-y-3">
                  {hofTournaments.map((t) => (
                    <div
                      key={t.id}
                      className="bg-slate-900/20 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:bg-slate-800/30 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <StatusBadge status={t.status} />
                        </div>
                        <h4 className="text-base font-bold text-slate-200 truncate">
                          {t.tournament_name}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1">
                          {t.tournament_date} &middot;{' '}
                          {t.players?.length ?? 0} zawodnik
                          {(t.players?.length ?? 0) !== 1 ? 'ów' : ''}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {t.status !== 'published' && (
                          <button
                            onClick={() => handlePublishHof(t.id)}
                            disabled={hofPublishing === t.id}
                            className="flex items-center gap-1.5 bg-slate-800 hover:bg-emerald-600/20 text-emerald-400 px-3 py-2 rounded-xl transition-all border border-transparent hover:border-emerald-500/30 text-xs font-bold"
                          >
                            {hofPublishing === t.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Opublikuj
                          </button>
                        )}
                        <button
                          onClick={() => handleHofEditClick(t)}
                          className="bg-slate-800 hover:bg-blue-600/20 text-blue-400 p-3 rounded-xl transition-all border border-transparent hover:border-blue-500/30"
                          title="Edytuj"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleHofDelete(t.id)}
                          className="bg-slate-800 hover:bg-red-600/20 text-red-400 p-3 rounded-xl transition-all border border-transparent hover:border-red-500/30"
                          title="Usuń"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TURNIEJE ("Co jest grane?")                                      */}
        {/* ================================================================ */}
        {activeTab === 'tournaments' && (
          <div className="mb-10 bg-slate-900/40 border border-slate-700 rounded-3xl p-6 lg:p-8 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-200">
                <Swords className="w-5 h-5 text-red-500" />
                {tournamentEditingId ? 'Edytuj turniej' : 'Dodaj turniej'}
              </h2>
              <button
                type="button"
                onClick={() => { resetTournamentForm(); switchTab(null); }}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {tournamentSuccess && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-3 rounded-xl">
                {tournamentSuccess}
              </div>
            )}
            {tournamentError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-4 rounded-xl">
                <p className="font-bold">Błąd: {tournamentError}</p>
              </div>
            )}

            <form onSubmit={handleSaveTournament} noValidate className="space-y-5 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Nazwa turnieju
                  </label>
                  <input
                    type="text" required value={tournamentName}
                    onChange={(e) => { setTournamentName(e.target.value); setDirty(true); }}
                    placeholder="np. Wiosenna Furia"
                    className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Status (widoczny tag)
                  </label>
                  <div className="relative">
                    <select
                      value={tournamentTag}
                      onChange={(e) => { setTournamentTag(e.target.value); setDirty(true); }}
                      className="w-full appearance-none bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all pr-9"
                    >
                      {TOURNAMENT_TAGS.map((tag) => (
                        <option key={tag} value={tag}>{tag}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Opis
                </label>
                <textarea
                  required value={tournamentDescription}
                  onChange={(e) => { setTournamentDescription(e.target.value); setDirty(true); }}
                  placeholder="Krótki opis turnieju wyświetlany na karcie..."
                  rows={3}
                  className="w-full max-w-lg bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Link (&ldquo;Zobacz szczegóły&rdquo;)
                  </label>
                  <input
                    type="url" required value={tournamentHref}
                    onChange={(e) => { setTournamentHref(e.target.value); setDirty(true); }}
                    placeholder="https://dota2inhouse.pl/..."
                    className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Kolejność (mniejsza liczba = wyżej)
                  </label>
                  <input
                    type="number" value={tournamentSortOrder}
                    onChange={(e) => { setTournamentSortOrder(Number(e.target.value)); setDirty(true); }}
                    className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <div className="bg-slate-950/30 border border-white/[0.05] rounded-2xl p-4 max-w-lg">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Baner turnieju (opcjonalny, ok. 210×70)
                </label>
                <div className="relative flex items-center justify-center border border-dashed border-white/10 hover:border-red-500/50 rounded-xl py-6 bg-[#181a20] transition-colors cursor-pointer">
                  <input
                    type="file" accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setTournamentImageFile(file);
                      if (file) setTournamentImagePreview(URL.createObjectURL(file));
                      setDirty(true);
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Upload className="w-4 h-4" /> Wybierz plik...
                  </div>
                </div>
                {tournamentImagePreview && (
                  <img
                    src={tournamentImagePreview}
                    alt="Podgląd banera"
                    className="mt-3 h-16 w-auto rounded-lg object-cover border border-white/10"
                  />
                )}
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
                <input
                  type="checkbox" checked={tournamentIsVisible}
                  onChange={(e) => { setTournamentIsVisible(e.target.checked); setDirty(true); }}
                  className="w-4 h-4 rounded accent-red-600"
                />
                <span className="text-sm font-semibold text-slate-300">
                  Widoczny na stronie głównej
                </span>
              </label>

              <div className="flex gap-3">
                <button
                  type="submit" disabled={tournamentSaving}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50"
                >
                  {tournamentSaving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {tournamentEditingId ? 'Zapisz zmiany' : 'Dodaj turniej'}
                </button>
                {tournamentEditingId && (
                  <button
                    type="button"
                    onClick={resetTournamentForm}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-6 rounded-xl transition-all"
                  >
                    <X className="w-4 h-4" /> Anuluj edycję
                  </button>
                )}
              </div>
            </form>

            {/* ─── Tournaments list ─── */}
            <div>
              <h3 className="text-xl font-bold mb-5 text-slate-300 flex items-center gap-2">
                <Swords className="w-5 h-5 text-slate-500" />
                Wszystkie turnieje
              </h3>

              {tournamentLoading ? (
                <div className="bg-slate-900/20 border border-white/5 rounded-2xl p-8 text-center text-slate-500">
                  Ładowanie...
                </div>
              ) : tournaments.length === 0 ? (
                <div className="bg-slate-900/20 border border-white/5 rounded-2xl p-8 text-center text-slate-500">
                  Brak turniejów w bazie.
                </div>
              ) : (
                <div className="space-y-3">
                  {tournaments.map((t) => (
                    <div
                      key={t.id}
                      className="bg-slate-900/20 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center hover:bg-slate-800/30 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-slate-200">{t.name}</span>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-sm bg-red-600/15 text-red-400">
                            {t.tag}
                          </span>
                          {!t.is_visible && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm bg-slate-700/40 text-slate-400">
                              Ukryty
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{t.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleTournamentVisibility(t)}
                          disabled={tournamentTogglingId === t.id}
                          className="bg-slate-800 hover:bg-emerald-600/20 text-emerald-400 p-3 rounded-xl transition-all border border-transparent hover:border-emerald-500/30 disabled:opacity-50"
                          title={t.is_visible ? 'Ukryj na stronie głównej' : 'Pokaż na stronie głównej'}
                        >
                          {t.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleTournamentEditClick(t)}
                          className="bg-slate-800 hover:bg-blue-600/20 text-blue-400 p-3 rounded-xl transition-all border border-transparent hover:border-blue-500/30"
                          title="Edytuj"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTournament(t.id)}
                          disabled={tournamentDeleting === t.id}
                          className="bg-slate-800 hover:bg-red-600/20 text-red-400 p-3 rounded-xl transition-all border border-transparent hover:border-red-500/30 disabled:opacity-50"
                          title="Usuń"
                        >
                          {tournamentDeleting === t.id ? (
                            <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* BASHER                                                            */}
        {/* ================================================================ */}
        {activeTab === 'basher' && (
          <div className="mb-10 bg-slate-900/40 border border-slate-700 rounded-3xl p-6 lg:p-8 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-200">
                <BookOpen className="w-5 h-5 text-red-500" /> {basherEditingId ? 'Edytuj Magazyn Basher' : 'Dodaj Magazyn Basher'}
              </h2>
              <button
                type="button"
                onClick={() => switchTab(null)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBasherSubmit} noValidate className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Numer wydania
                  </label>
                  <input
                    type="number" required min={1} value={basherIssueNumber}
                    onChange={(e) => { setBasherIssueNumber(e.target.value); setDirty(true); }}
                    placeholder="np. 1"
                    className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Tytuł
                  </label>
                  <input
                    type="text" required value={basherTitle}
                    onChange={(e) => { setBasherTitle(e.target.value); setDirty(true); }}
                    placeholder="Nazwa wydania"
                    className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Data publikacji
                  </label>
                  <input
                    type="date" value={basherPublishDate}
                    onChange={(e) => { setBasherPublishDate(e.target.value); setDirty(true); }}
                    className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Link zewnętrzny (opcjonalny)
                </label>
                <input
                  type="url" value={basherLinkUrl}
                  onChange={(e) => { setBasherLinkUrl(e.target.value); setDirty(true); }}
                  placeholder="https://example.com"
                  className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                />
              </div>

              {/* File upload zone */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Strony (obrazy)
                </label>

                <div
                  onClick={() => basherInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-red-500/40 rounded-2xl p-8 text-center cursor-pointer transition-all bg-slate-950/20 hover:bg-slate-900/30"
                >
                  <Upload className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                  <p className="text-slate-400 font-medium">
                    Kliknij, aby wybrać pliki
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Pliki zostaną posortowane alfabetycznie — nazwij je page1.png, page2.png itd.
                  </p>
                  <input
                    ref={basherInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleBasherFileSelect}
                    className="hidden"
                  />
                </div>

                {/* Preview list */}
                {basherPreviews.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs text-slate-500 font-semibold">
                      Podgląd ({basherPreviews.length} stron
                      {basherPreviews.length > 0 ? ', pierwsza = okładka' : ''})
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {basherPreviews.map((url, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={url}
                            alt={`Strona ${i + 1}`}
                            className="w-full aspect-[3/4] object-cover rounded-xl border border-slate-700 bg-slate-900"
                          />
                          <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                            #{i + 1}
                          </span>
                          {basherFiles.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveBasherFile(i)}
                              className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {basherPreviews.length === 0 && basherEditingId && (
                  <p className="text-xs text-amber-400 mt-2">
                    Brak zapisanych stron. Wybierz pliki, aby dodać strony do tego wydania.
                  </p>
                )}
              </div>

              {basherSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-3 rounded-xl">
                  {basherSuccess === 'updated' ? 'Wydanie zostało zaktualizowane!' : 'Wydanie zostało zapisane jako szkic!'}
                </div>
              )}
              {basherError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-4 rounded-xl">
                  <p className="font-bold">Błąd zapisu: {basherError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-3 border-t border-white/[0.07]">
                <button
                  type="submit" disabled={basherSaving}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 text-white font-bold py-3 px-6 rounded-xl transition-all"
                >
                  {basherSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Zapisywanie...
                    </>
                  ) : basherEditingId ? (
                    <><Save className="w-4 h-4" /> Zapisz zmiany</>
                  ) : (
                    <><Save className="w-4 h-4" /> Zapisz wydanie (Szkic)</>
                  )}
                </button>
                {basherEditingId ? (
                  <button
                    type="button"
                    onClick={resetBasherForm}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-6 rounded-xl transition-all"
                  >
                    <X className="w-4 h-4" /> Anuluj edycję
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => switchTab(null)}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-6 rounded-xl transition-all"
                  >
                    <X className="w-4 h-4" /> Zamknij
                  </button>
                )}
              </div>
            </form>

            {/* Existing issues list */}
            <div className="mt-8 border-t border-white/[0.07] pt-6">
              <h3 className="text-lg font-bold text-slate-300 mb-4 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-red-500" />
                Zapisane wydania
              </h3>

              {basherLoading ? (
                <div className="flex items-center gap-3 text-slate-500 py-6">
                  <div className="w-5 h-5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                  Ładowanie...
                </div>
              ) : basherIssues.length === 0 ? (
                <div className="bg-slate-900/20 border border-white/5 rounded-2xl p-8 text-center text-slate-500">
                  Brak zapisanych wydań.
                </div>
              ) : (
                <div className="space-y-3">
                  {basherIssues.map((issue) => (
                    <div
                      key={issue.id}
                      className="bg-slate-900/20 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:bg-slate-800/30 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <StatusBadge status={issue.status} />
                        </div>
                        <h4 className="text-base font-bold text-slate-200 truncate">
                          #{issue.issue_number} — {issue.title}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1">
                          {issue.publish_date} &middot;{' '}
                          {issue.pages?.length ?? 0} strona
                          {(issue.pages?.length ?? 0) !== 1 ? 'n' : ''}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {issue.status !== 'published' && (
                          <button
                            onClick={() => handlePublishBasher(issue.id)}
                            disabled={basherPublishing === issue.id}
                            className="flex items-center gap-1.5 bg-slate-800 hover:bg-emerald-600/20 text-emerald-400 px-3 py-2 rounded-xl transition-all border border-transparent hover:border-emerald-500/30 text-xs font-bold"
                          >
                            {basherPublishing === issue.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Opublikuj
                          </button>
                        )}
                        <button
                          onClick={() => handleBasherEditClick(issue)}
                          className="bg-slate-800 hover:bg-blue-600/20 text-blue-400 p-3 rounded-xl transition-all border border-transparent hover:border-blue-500/30 flex-shrink-0"
                          title="Edytuj"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleBasherDelete(issue.id)}
                          className="bg-slate-800 hover:bg-red-600/20 text-red-400 p-3 rounded-xl transition-all border border-transparent hover:border-red-500/30 flex-shrink-0"
                          title="Usuń"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* RANKING MANAGEMENT                                               */}
        {/* ================================================================ */}
        {activeTab === 'ranking' && (
          <div className="mb-10 bg-slate-900/40 border border-slate-700 rounded-3xl p-6 lg:p-8 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-200">
                <Users className="w-5 h-5 text-red-500" /> Zarządzanie Rankingiem
              </h2>
              <button
                type="button"
                onClick={() => switchTab(null)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {rankSuccess && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-3 rounded-xl">
                {rankSuccess}
              </div>
            )}
            {rankError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-4 rounded-xl">
                <p className="font-bold">Błąd: {rankError}</p>
              </div>
            )}

            <div className="mb-4">
              <input
                type="text"
                value={rankSearch}
                onChange={(e) => setRankSearch(e.target.value)}
                placeholder="Szukaj gracza po Steam ID..."
                className="w-full max-w-md bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
              />
            </div>

            {rankLoading ? (
              <div className="flex items-center gap-3 text-slate-500 py-6">
                <div className="w-5 h-5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                Ładowanie graczy...
              </div>
            ) : rankPlayers.length === 0 ? (
              <div className="bg-slate-900/20 border border-white/5 rounded-2xl p-8 text-center text-slate-500">
                Brak graczy w bazie rankingu.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {rankPlayers
                  .filter((p) =>
                    rankSearch === '' ||
                    p.steam_id.toLowerCase().includes(rankSearch.toLowerCase())
                  )
                  .map((player) => (
                    <div
                      key={player.id}
                      className="bg-slate-900/20 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center hover:bg-slate-800/30 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-slate-200 truncate">
                          {player.name}
                        </p>
                        <p className="text-xs font-mono text-slate-500 mt-0.5">
                          Steam ID: {player.steam_id}
                        </p>
                        <p className="text-xs text-slate-500">
                          Dodany: {new Date(player.created_at).toLocaleDateString('pl-PL')}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteRankPlayer(player.steam_id)}
                        disabled={rankDeleting === player.steam_id}
                        className="flex items-center gap-1.5 bg-slate-800 hover:bg-red-600/20 text-red-400 px-4 py-2 rounded-xl transition-all border border-transparent hover:border-red-500/30 text-xs font-bold disabled:opacity-50"
                      >
                        {rankDeleting === player.steam_id ? (
                          <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Usuń
                      </button>
                    </div>
                  ))}
                {rankPlayers.filter((p) =>
                  rankSearch === '' ||
                  p.steam_id.toLowerCase().includes(rankSearch.toLowerCase())
                ).length === 0 && (
                  <div className="bg-slate-900/20 border border-white/5 rounded-2xl p-6 text-center text-slate-500">
                    Brak graczy spełniających kryteria wyszukiwania.
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-4">
              Łącznie zarejestrowanych graczy: {rankPlayers.length}
            </p>
          </div>
        )}

        {activeTab === 'top5000' && (
          <div className="mb-10 bg-slate-900/40 border border-slate-700 rounded-3xl p-6 lg:p-8 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-200">
                <ListOrdered className="w-5 h-5 text-red-500" /> Ranking 5k
              </h2>
              <button
                type="button"
                onClick={() => switchTab(null)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-6 max-w-2xl leading-relaxed">
              Lista z oficjalnego top 5000 (bez SteamID — tego pola nie ma w źródłowym pliku). Wpisz ręcznie
              32-bitowe Account ID (ten sam numer co w linku do profilu Dotabuff/OpenDota), żeby gracz zaczął
              zbierać realne statystyki — dociągnie je najbliższa nocna synchronizacja, tak samo jak przy
              samodzielnym połączeniu konta.
            </p>

            {top5000Success && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-3 rounded-xl">
                {top5000Success}
              </div>
            )}
            {top5000Error && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-4 rounded-xl">
                <p className="font-bold">Błąd: {top5000Error}</p>
              </div>
            )}

            <div className="mb-4">
              <input
                type="text"
                value={top5000Search}
                onChange={(e) => setTop5000Search(e.target.value)}
                placeholder="Szukaj gracza po nicku..."
                className="w-full max-w-md bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
              />
            </div>

            {top5000Loading ? (
              <div className="flex items-center gap-3 text-slate-500 py-6">
                <div className="w-5 h-5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                Ładowanie listy...
              </div>
            ) : top5000Players.length === 0 ? (
              <div className="bg-slate-900/20 border border-white/5 rounded-2xl p-8 text-center text-slate-500">
                Brak graczy z top 5000 w bazie.
              </div>
            ) : (
              <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
                {top5000Players
                  .filter((p) =>
                    top5000Search === '' || p.name.toLowerCase().includes(top5000Search.toLowerCase())
                  )
                  .map((player) => {
                    const edited = top5000Edits[player.id] ?? '';
                    const rowDirty = edited.trim() !== (player.steam_id ?? '');
                    return (
                      <div
                        key={player.id}
                        className="bg-slate-900/20 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center hover:bg-slate-800/30 transition-all"
                      >
                        <div className="flex-1 min-w-0 flex items-center gap-3">
                          <span className="text-xs font-black text-slate-500 w-12 shrink-0">
                            {player.leaderboard_rank ? `#${player.leaderboard_rank}` : '—'}
                          </span>
                          <div className="min-w-0">
                            <p className="text-base font-bold text-slate-200 truncate">
                              {player.name}
                              {player.source_name && player.source_name !== player.name && (
                                <span className="ml-2 text-xs font-normal text-amber-500/80" title="Nick z listy top 5000 — zmienił się od czasu przypisania SteamID">
                                  (top5000: {player.source_name})
                                </span>
                              )}
                            </p>
                            <p className="text-xs mt-0.5 font-mono">
                              {player.steam_id ? (
                                <span className="text-emerald-500">Połączony: {player.steam_id}</span>
                              ) : (
                                <span className="text-slate-600">Brak SteamID</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={edited}
                            onChange={(e) =>
                              setTop5000Edits((prev) => ({ ...prev, [player.id]: e.target.value }))
                            }
                            placeholder="SteamID (Account ID)"
                            className="flex-1 sm:w-48 bg-[#181a20] border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-600 font-mono focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveTop5000SteamId(player.id)}
                            disabled={!rowDirty || top5000Saving === player.id}
                            className="flex items-center gap-1.5 bg-slate-800 hover:bg-emerald-600/20 text-emerald-400 px-4 py-2 rounded-xl transition-all border border-transparent hover:border-emerald-500/30 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                          >
                            {top5000Saving === player.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5" />
                            )}
                            Zapisz
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTop5000Player(player.id, player.name)}
                            disabled={top5000Deleting === player.id}
                            className="flex items-center gap-1.5 bg-slate-800 hover:bg-red-600/20 text-red-400 p-2.5 rounded-xl transition-all border border-transparent hover:border-red-500/30 disabled:opacity-50 shrink-0"
                            title="Usuń z listy"
                          >
                            {top5000Deleting === player.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                {top5000Players.filter((p) =>
                  top5000Search === '' || p.name.toLowerCase().includes(top5000Search.toLowerCase())
                ).length === 0 && (
                  <div className="bg-slate-900/20 border border-white/5 rounded-2xl p-6 text-center text-slate-500">
                    Brak graczy spełniających kryteria wyszukiwania.
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-4">
              Łącznie graczy z top 5000: {top5000Players.length} · z przypisanym SteamID:{' '}
              {top5000Players.filter((p) => p.steam_id).length}
            </p>
          </div>
        )}

        {/* ================================================================ */}
        {/* STREAMERS                                                         */}
        {/* ================================================================ */}
        {activeTab === 'streamers' && (
          <div className="mb-10 bg-slate-900/40 border border-slate-700 rounded-3xl p-6 lg:p-8 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-200">
                <Radio className="w-5 h-5 text-purple-500" />
                {streamerEditingId ? 'Edytuj streamera' : 'Dodaj streamera'}
              </h2>
              <button
                type="button"
                onClick={() => switchTab(null)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {streamerSuccess && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-3 rounded-xl">
                {streamerSuccess}
              </div>
            )}
            {streamerError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-4 rounded-xl">
                <p className="font-bold">Błąd: {streamerError}</p>
              </div>
            )}

            <form onSubmit={handleStreamerSubmit} noValidate className="space-y-5 mb-8">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Nick streamera
                </label>
                <input
                  type="text" required value={streamerNick}
                  onChange={(e) => { setStreamerNick(e.target.value); setDirty(true); }}
                  placeholder="np. Gorgc"
                  className="w-full max-w-md bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Opis / motto (max 300 znaków)
                </label>
                <textarea
                  required maxLength={300} value={streamerMotto}
                  onChange={(e) => { setStreamerMotto(e.target.value); setDirty(true); }}
                  placeholder="Krótki opis streamera..."
                  rows={3}
                  className="w-full max-w-lg bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none"
                />
                <p className="text-xs text-slate-500 mt-1">{streamerMotto.length}/300</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Link do streama (Twitch / Kick)
                </label>
                <input
                  type="url" required value={streamerUrl}
                  onChange={(e) => { setStreamerUrl(e.target.value); setDirty(true); }}
                  placeholder="https://www.twitch.tv/kanal"
                  className="w-full max-w-md bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit" disabled={streamerSaving}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50"
                >
                  {streamerSaving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : streamerEditingId ? (
                    <Save className="w-4 h-4" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {streamerEditingId ? 'Zapisz zmiany' : 'Dodaj streamera'}
                </button>
                {streamerEditingId && (
                  <button
                    type="button"
                    onClick={resetStreamerForm}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-6 rounded-xl transition-all"
                  >
                    <X className="w-4 h-4" /> Anuluj edycję
                  </button>
                )}
              </div>
            </form>

            {/* ─── Streamers list ─── */}
            {streamers.length === 0 ? (
              <div className="bg-slate-900/20 border border-white/5 rounded-2xl p-8 text-center text-slate-500">
                Brak streamerów w bazie.
              </div>
            ) : (
              <div className="space-y-2">
                {streamers.map((streamer, index) => (
                  <div
                    key={streamer.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`bg-slate-900/20 border rounded-2xl p-4 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center transition-all select-none cursor-grab active:cursor-grabbing ${
                      draggedIndex === index
                        ? 'opacity-40 border-purple-500/50 bg-purple-500/5'
                        : 'border-slate-800 hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-slate-200 truncate">
                        {streamer.nick}
                      </p>
                      {streamer.motto && (
                        <p className="text-sm text-slate-500 truncate mt-0.5">{streamer.motto}</p>
                      )}
                      <a
                        href={streamer.stream_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-400 hover:text-purple-300 truncate block mt-0.5"
                      >
                        {streamer.stream_url}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setStreamerEditingId(streamer.id);
                          setStreamerNick(streamer.nick);
                          setStreamerMotto(streamer.motto || '');
                          setStreamerUrl(streamer.stream_url);
                          setDirty(true);
                        }}
                        className="bg-slate-800 hover:bg-blue-600/20 text-blue-400 p-3 rounded-xl transition-all border border-transparent hover:border-blue-500/30"
                        title="Edytuj"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteStreamer(streamer.id)}
                        disabled={streamerDeleting === streamer.id}
                        className="bg-slate-800 hover:bg-red-600/20 text-red-400 p-3 rounded-xl transition-all border border-transparent hover:border-red-500/30 disabled:opacity-50"
                        title="Usuń"
                      >
                        {streamerDeleting === streamer.id ? (
                          <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {streamers.length > 0 && (
              <button
                type="button"
                onClick={handleSaveStreamerPositions}
                disabled={isSavingPositions}
                className="mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50 w-full sm:w-auto"
              >
                {isSavingPositions ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Zatwierdź kolejność
              </button>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* TESTIMONIALS                                                      */}
        {/* ================================================================ */}
        {activeTab === 'testimonials' && (
          <div className="mb-10 bg-slate-900/40 border border-slate-700 rounded-3xl p-6 lg:p-8 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-200">
                <MessageSquare className="w-5 h-5 text-yellow-500" />
                {testimonialEditingId ? 'Edytuj opinię' : 'Dodaj opinię'}
              </h2>
              <button
                type="button"
                onClick={() => { resetTestimonialForm(); switchTab(null); }}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {testimonialSuccess && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-3 rounded-xl">
                {testimonialSuccess}
              </div>
            )}
            {testimonialError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-4 rounded-xl">
                <p className="font-bold">Błąd: {testimonialError}</p>
              </div>
            )}

            <form onSubmit={handleSaveTestimonial} noValidate className="space-y-5 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Nick
                  </label>
                  <input
                    type="text" required value={testimonialNick}
                    onChange={(e) => { setTestimonialNick(e.target.value); setDirty(true); }}
                    placeholder="np. Kamil"
                    className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Avatar URL (opcjonalny)
                  </label>
                  <input
                    type="url" value={testimonialAvatarUrl}
                    onChange={(e) => { setTestimonialAvatarUrl(e.target.value); setDirty(true); }}
                    placeholder="https://example.com/avatar.png"
                    className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Headline / Tytuł opinii
                </label>
                <input
                  type="text" required value={testimonialHeadline}
                  onChange={(e) => { setTestimonialHeadline(e.target.value); setDirty(true); }}
                  placeholder="np. Najlepsze inhouse'y w Polsce"
                  className="w-full max-w-lg bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Treść opinii
                </label>
                <textarea
                  required value={testimonialText}
                  onChange={(e) => { setTestimonialText(e.target.value); setDirty(true); }}
                  placeholder="Treść opinii..."
                  rows={3}
                  className="w-full max-w-lg bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Ilość gwiazdek (1-5)
                </label>
                <div className="relative max-w-[120px]">
                  <select
                    value={testimonialRating}
                    onChange={(e) => { setTestimonialRating(Number(e.target.value)); setDirty(true); }}
                    className="w-full appearance-none bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all pr-9"
                  >
                    {[1,2,3,4,5].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit" disabled={testimonialSaving}
                  className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50"
                >
                  {testimonialSaving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {testimonialEditingId ? 'Zapisz zmiany' : 'Dodaj opinię'}
                </button>
                {testimonialEditingId && (
                  <button
                    type="button"
                    onClick={resetTestimonialForm}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-6 rounded-xl transition-all"
                  >
                    <X className="w-4 h-4" /> Anuluj edycję
                  </button>
                )}
              </div>
            </form>

            {/* ─── Testimonials list ─── */}
            <div>
              <h3 className="text-xl font-bold mb-5 text-slate-300 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-slate-500" />
                Wszystkie opinie
              </h3>

              {testimonials.length === 0 ? (
                <div className="bg-slate-900/20 border border-white/5 rounded-2xl p-8 text-center text-slate-500">
                  Brak opinii w bazie.
                </div>
              ) : (
                <div className="space-y-3">
                  {testimonials.map((t) => (
                    <div
                      key={t.id}
                      className="bg-slate-900/20 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center hover:bg-slate-800/30 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-slate-200">{t.name}</span>
                          <span className="text-yellow-500 text-xs flex gap-0.5">
                            {[...Array(t.rating)].map((_, i) => (
                              <Star key={i} className="w-3 h-3 fill-yellow-500" />
                            ))}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-slate-300 truncate">{t.headline}</p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{t.text}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setTestimonialEditingId(t.id);
                            setTestimonialNick(t.name);
                            setTestimonialAvatarUrl(t.avatar_url || '');
                            setTestimonialHeadline(t.headline);
                            setTestimonialText(t.text);
                            setTestimonialRating(t.rating);
                            setDirty(true);
                          }}
                          className="bg-slate-800 hover:bg-blue-600/20 text-blue-400 p-3 rounded-xl transition-all border border-transparent hover:border-blue-500/30"
                          title="Edytuj"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTestimonial(t.id)}
                          disabled={testimonialDeleting === t.id}
                          className="bg-slate-800 hover:bg-red-600/20 text-red-400 p-3 rounded-xl transition-all border border-transparent hover:border-red-500/30 disabled:opacity-50"
                          title="Usuń"
                        >
                          {testimonialDeleting === t.id ? (
                            <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* STRONY CMS                                                       */}
        {/* ================================================================ */}
        {activeTab === 'pages' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CONTENT_PAGES) as ContentSlug[]).map((slug) => {
                const isActive = pageSlug === slug;
                return (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => setPageSlug(slug)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                      isActive
                        ? 'bg-red-600/15 text-red-400 border-red-500/25'
                        : 'bg-slate-900/40 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {CONTENT_PAGES[slug].title}
                  </button>
                );
              })}
            </div>

            {/* Keyed on the slug so switching pages remounts the editor — it
                loads its own content on mount, and a stale body must never be
                left in the box under a different page's Zapisz button. */}
            <RenderContentPageEditor
              key={pageSlug}
              slug={pageSlug}
              label={CONTENT_PAGES[pageSlug].title}
              content={pageContent}
              setContent={setPageContent}
              loading={pageLoading}
              setLoading={setPageLoading}
              fetchContentPage={fetchContentPage}
              handleSave={handleSaveContentPage}
              pagesSaving={pagesSaving}
              pagesSuccess={pagesSuccess}
              pagesError={pagesError}
            />

            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Usunąć zawartość strony „${CONTENT_PAGES[pageSlug].title}” i zacząć od nowa?`)) return;
                await deleteContentPage(pageSlug);
                setPageContent('');
                setPageLoading(true);
                fetchContentPage(pageSlug, setPageContent, setPageLoading);
              }}
              className="text-sm text-red-400 hover:text-red-300 underline underline-offset-2"
            >
              Resetuj stronę (usuń zawartość z bazy)
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* NEWS                                                              */}
        {/* ================================================================ */}
        {activeTab === 'news' && (
          <>
            {/* News form */}
            <div className="mb-10 bg-slate-900/40 border border-slate-700 rounded-3xl p-6 lg:p-8 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-200">
                  {editingId
                    ? <><Edit2 className="w-5 h-5 text-red-500" /> Edytuj wpis</>
                    : <><Plus className="w-5 h-5 text-emerald-500" /> Nowy news</>
                  }
                </h2>
                <button
                  type="button" onClick={() => { resetNewsForm(); switchTab(null); }}
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveNews} noValidate className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Nagłówek (tytuł)
                    </label>
                    <input
                      type="text" required value={title}
                      onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
                      placeholder="Wpisz tytuł newsa…"
                      className="w-full bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Kategoria
                    </label>
                    <div className="relative">
                      <select
                        value={category}
                        onChange={(e) => { setCategory(e.target.value); setDirty(true); }}
                        className="w-full appearance-none bg-[#181a20] border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all pr-9"
                      >
                        <option value="Turniej">Turniej</option>
                        <option value="PDL">PDL</option>
                        <option value="Społeczność">Społeczność</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Główna treść (body)
                  </label>
                  <RichTextEditor
                    value={content}
                    onChange={(val) => { setContent(val); setDirty(true); }}
                    placeholder="Wpisz treść wpisu…"
                  />
                </div>

                {/* ── Image upload ── */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Zdjęcie do newsa (opcjonalne)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setNewsImageFile(file);
                      setNewsImagePreview(file ? URL.createObjectURL(file) : null);
                      setDirty(true);
                    }}
                    className="w-full max-w-md text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 transition-all cursor-pointer"
                  />
                  {newsImagePreview && (
                    <div className="mt-3 relative inline-block">
                      <img
                        src={newsImagePreview}
                        alt="Podgląd"
                        className="max-h-[200px] rounded-xl border border-white/10"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setNewsImageFile(null);
                          setNewsImagePreview(null);
                        }}
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold hover:bg-red-500 transition-all"
                      >
                        X
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="submit"
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-xl transition-all"
                  >
                    <Save className="w-4 h-4" />
                    {editingId ? 'Zapisz zmiany' : 'Zapisz jako szkic'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { resetNewsForm(); switchTab(null); }}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-6 rounded-xl transition-all"
                  >
                    <X className="w-4 h-4" /> Anuluj
                  </button>
                </div>
              </form>
            </div>

            {/* News list */}
            <div className="animate-in fade-in duration-200">
              <h2 className="text-xl font-bold mb-5 text-slate-300 flex items-center gap-2">
                <Newspaper className="w-5 h-5 text-slate-500" />
                Wszystkie wpisy
              </h2>

              {loading ? (
                <div className="flex items-center gap-3 text-slate-500 py-10">
                  <div className="w-5 h-5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                  Ładowanie wpisów...
                </div>
              ) : news.length === 0 ? (
                <div className="bg-slate-900/20 border border-white/5 rounded-3xl p-10 text-center text-slate-500">
                  Brak wpisów w bazie danych.
                </div>
              ) : (
                <div className="space-y-3">
                  {news.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-900/20 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:bg-slate-800/30 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <StatusBadge status={item.status} />
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border font-sans ${
                            item.category === 'PDL'
                              ? 'text-red-500 bg-red-500/10 border-red-500/20'
                              : item.category === 'Turniej'
                              ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                              : item.category === 'Społeczność'
                              ? 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20'
                              : 'text-slate-400 bg-slate-400/10 border-slate-400/20'
                          }`}>
                            {item.category}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">
                            {new Date(item.created_at).toLocaleDateString('pl-PL')}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-200 truncate">{item.title}</h3>
                        <p className="text-sm text-slate-500 truncate mt-1">
                          {item.content.replace(/<[^>]*>/g, '')}
                        </p>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        {item.status !== 'published' && (
                          <button
                            onClick={() => handlePublishNews(item.id)}
                            disabled={newsPublishing === item.id}
                            className="flex items-center gap-1.5 bg-slate-800 hover:bg-emerald-600/20 text-emerald-400 px-3 py-2 rounded-xl transition-all border border-transparent hover:border-emerald-500/30 text-xs font-bold"
                          >
                            {newsPublishing === item.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Opublikuj
                          </button>
                        )}
                        <button
                          onClick={() => handleEditClick(item)}
                          className="bg-slate-800 hover:bg-blue-600/20 text-blue-400 p-3 rounded-xl transition-all border border-transparent hover:border-blue-500/30"
                          title="Edytuj"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteNews(item.id)}
                          className="bg-slate-800 hover:bg-red-600/20 text-red-400 p-3 rounded-xl transition-all border border-transparent hover:border-red-500/30"
                          title="Usuń"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

          </div>
        </div>
      </section>
    </main>
  );
}

function RenderContentPageEditor({
  slug, label, content, setContent, loading, setLoading,
  fetchContentPage, handleSave, pagesSaving, pagesSuccess, pagesError,
}: {
  slug: string;
  label: string;
  content: string;
  setContent: (v: string) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  fetchContentPage: (slug: string, setContent: (v: string) => void, setLoading: (v: boolean) => void) => Promise<void>;
  handleSave: (slug: string, content: string) => Promise<void>;
  pagesSaving: boolean;
  pagesSuccess: string | null;
  pagesError: string | null;
}) {
  useEffect(() => {
    fetchContentPage(slug, setContent, setLoading);
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-extrabold text-white flex items-center gap-3 mb-6">
        <FileText className="w-6 h-6 text-red-500" />
        Edytuj stronę — {label}
      </h2>

      {pagesSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-xl text-sm">{pagesSuccess}</div>
      )}
      {pagesError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">{pagesError}</div>
      )}

      <div className="bg-slate-900/40 border border-slate-700 rounded-3xl p-6 lg:p-8 backdrop-blur-md">
        {loading ? (
          <div className="flex items-center gap-3 text-slate-500 text-sm py-8">
            <div className="w-5 h-5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
            Ładowanie treści...
          </div>
        ) : (
          <>
            <RichTextEditor
              value={content}
              onChange={(val) => setContent(val)}
              placeholder="Wpisz treść strony..."
            />
            <div className="mt-4">
              <button
                type="button"
                onClick={() => handleSave(slug, content)}
                disabled={pagesSaving}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              >
                {pagesSaving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Zapisz
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
