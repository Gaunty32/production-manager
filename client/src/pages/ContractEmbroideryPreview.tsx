import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { PRICING_2026, PRINT_PRICING_2026, SEPTEMBER_PRICE_INCREASE } from "@shared/pricing";
import { ArrowRight, Check, ChevronDown, Clock3, Factory, Menu, Play, ShieldCheck, X } from "lucide-react";
import sbsLogo from "@assets/logo_transparent.png";
import floorOne from "@assets/contract-embroidery-floor-1.webp";
import floorTwo from "@assets/contract-embroidery-floor-2.webp";
import floorThree from "@assets/contract-embroidery-floor-3.webp";
import floorFour from "@assets/contract-embroidery-floor-4.webp";

const campaigns: Record<string, { eyebrow: string; title: string; emphasis: string; support?: string }> = {
  capacity: { eyebrow: "Contract embroidery for growing suppliers", title: "Need more embroidery capacity?", emphasis: "Use ours.", support: "Increase production without buying another machine." },
  growth: { eyebrow: "Your next production department", title: "Grow your branded clothing business.", emphasis: "Without growing your production headache." },
  machinery: { eyebrow: "Before you commit capital", title: "Before you buy another embroidery machine...", emphasis: "Use ours." },
  recruitment: { eyebrow: "A production team you can rely on", title: "Can't find embroidery operators?", emphasis: "Use our production team." },
  "lead-times": { eyebrow: "UK contract embroidery", title: "Is production slowing your business down?", emphasis: "Keep your sales moving.", support: "Outsource to a dedicated embroidery production partner with a standard 3–4 working day lead time." },
  sportswear: { eyebrow: "Built for sportswear and teamwear", title: "You sell the teamwear.", emphasis: "We'll embroider it." },
  workwear: { eyebrow: "Contract embroidery for workwear", title: "Grow your workwear business.", emphasis: "We'll take care of the embroidery." },
  overflow: { eyebrow: "Overflow production, without the drama", title: "Your machines are full.", emphasis: "Ours don't have to be.", support: "Use our Contract Embroidery Division for overflow production without giving up control of your customer." },
  outsourcing: { eyebrow: "Your outsourced production department", title: "Outsource your embroidery production.", emphasis: "Concentrate on growing your business." },
};

const challenges = ["Capacity", "Recruitment", "Lead times", "Machinery investment", "Staff sickness/holidays", "Quality", "Production management", "Seasonal demand", "Growth", "Outsourcing all production", "Outsourcing overflow production", "Other"];
const photos = [
  { src: floorOne, alt: "Select Branding Solutions embroidery production floor", label: "Industrial production, properly managed." },
  { src: floorTwo, alt: "Operator preparing embroidery production", label: "Experienced people behind every run." },
  { src: floorThree, alt: "Close view of embroidered garments", label: "Consistency is the point." },
  { src: floorFour, alt: "Multi-head embroidery machinery in the UK", label: "Capacity ready when you need it." },
];

function track(name: string, detail?: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent("select-analytics", { detail: { event: name, ...detail } }));
  const dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer;
  dataLayer?.push({ event: name, ...detail });
}

function scrollToForm() {
  document.getElementById("qualification-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function ContractEmbroideryPreview() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const [videoStarted, setVideoStarted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [formStarted, setFormStarted] = useState(false);
  const [selectedChallenges, setSelectedChallenges] = useState<string[]>([]);
  const firstVisit = useRef<string | undefined>(undefined);
  const firstLandingUrl = useRef<string | undefined>(undefined);
  const attribution = useRef<URLSearchParams | undefined>(undefined);
  const videoPlayerNode = useRef<HTMLDivElement | null>(null);
  const videoProgressInterval = useRef<number | undefined>(undefined);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const variant = campaigns[params.get("campaign")?.toLowerCase() || ""] || null;

  useEffect(() => {
    document.title = "Contract Embroidery Production Partner | Select Branding Solutions";
    const description = "Grow your branded clothing business with dedicated UK contract embroidery capacity, 38 embroidery heads and a standard 3–4 working day lead time.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "description"); document.head.appendChild(meta); }
    meta.setAttribute("content", description);
    const setSocialMeta = (property: string, content: string) => {
      let socialMeta = document.querySelector(`meta[property="${property}"]`);
      if (!socialMeta) {
        socialMeta = document.createElement("meta");
        socialMeta.setAttribute("property", property);
        document.head.appendChild(socialMeta);
      }
      socialMeta.setAttribute("content", content);
    };
    setSocialMeta("og:title", "Contract Embroidery Production Partner | Select Branding Solutions");
    setSocialMeta("og:description", description);
    setSocialMeta("og:type", "website");
    const firstVisitKey = "select-contract-first-visit";
    const attributionKey = "select-contract-attribution";
    const landingUrlKey = "select-contract-landing-url";
    const storedVisit = sessionStorage.getItem(firstVisitKey);
    const storedAttribution = sessionStorage.getItem(attributionKey);
    const storedLandingUrl = sessionStorage.getItem(landingUrlKey);
    firstVisit.current = storedVisit || new Date().toISOString();
    firstLandingUrl.current = storedLandingUrl || window.location.href;
    attribution.current = new URLSearchParams(storedAttribution || params.toString());
    if (!storedVisit) sessionStorage.setItem(firstVisitKey, firstVisit.current);
    if (!storedAttribution) sessionStorage.setItem(attributionKey, params.toString());
    if (!storedLandingUrl) sessionStorage.setItem(landingUrlKey, firstLandingUrl.current);
    track("landing_page_view", { campaign: params.get("campaign"), source: params.get("source"), landing_url: window.location.href });
    const onScroll = () => { if (document.getElementById("qualification-form")?.getBoundingClientRect().top! < window.innerHeight) track("form_view"); };
    window.addEventListener("scroll", onScroll, { once: true, passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [params]);

  useEffect(() => {
    if (!videoStarted || !videoPlayerNode.current) return;

    let player: any;
    let disposed = false;
    const reachedMilestones = new Set<number>();
    const clearProgressTimer = () => {
      if (videoProgressInterval.current) {
        window.clearInterval(videoProgressInterval.current);
        videoProgressInterval.current = undefined;
      }
    };
    const checkProgress = () => {
      const duration = player?.getDuration?.();
      const currentTime = player?.getCurrentTime?.();
      if (!duration || currentTime === undefined) return;
      const percentage = (currentTime / duration) * 100;
      for (const milestone of [25, 50, 75]) {
        if (percentage >= milestone && !reachedMilestones.has(milestone)) {
          reachedMilestones.add(milestone);
          track(`video_${milestone}_percent`);
        }
      }
    };
    const createPlayer = () => {
      const YouTube = (window as any).YT;
      if (disposed || !YouTube?.Player || !videoPlayerNode.current) return;
      player = new YouTube.Player(videoPlayerNode.current, {
        videoId: "6HE3NCGQMfg",
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, rel: 0, start: 2 },
        events: {
          onStateChange: ({ data }: { data: number }) => {
            if (data === YouTube.PlayerState?.PLAYING || data === 1) {
              clearProgressTimer();
              videoProgressInterval.current = window.setInterval(checkProgress, 1000);
            }
            if (data === YouTube.PlayerState?.ENDED || data === 0) {
              checkProgress();
              clearProgressTimer();
              if (!reachedMilestones.has(100)) {
                reachedMilestones.add(100);
                track("video_complete");
              }
            }
          },
        },
      });
    };

    if ((window as any).YT?.Player) {
      createPlayer();
    } else {
      const existingScript = document.getElementById("youtube-iframe-api");
      const previousReady = (window as any).onYouTubeIframeAPIReady;
      const readyHandler = () => {
        previousReady?.();
        createPlayer();
      };
      (window as any).onYouTubeIframeAPIReady = readyHandler;
      if (!existingScript) {
        const script = document.createElement("script");
        script.id = "youtube-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
      return () => {
        disposed = true;
        clearProgressTimer();
        if ((window as any).onYouTubeIframeAPIReady === readyHandler) {
          (window as any).onYouTubeIframeAPIReady = previousReady;
        }
        player?.destroy?.();
      };
    }

    return () => {
      disposed = true;
      clearProgressTimer();
      player?.destroy?.();
    };
  }, [videoStarted]);

  const hero = variant || { eyebrow: "Select Branding Solutions / Contract Embroidery Division", title: "Grow your branded clothing business.", emphasis: "We'll take care of the embroidery.", support: "Add professional embroidery capacity without buying more machines, recruiting embroidery operators or increasing your fixed overheads." };
  const toggleChallenge = (challenge: string) => setSelectedChallenges(current => current.includes(challenge) ? current.filter(item => item !== challenge) : [...current, challenge]);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true); setError("");
    const form = new FormData(event.currentTarget);
    const recordedAttribution = attribution.current || params;
    const payload = {
      name: String(form.get("name") || ""), businessName: String(form.get("businessName") || ""),
      email: String(form.get("email") || ""), mobile: String(form.get("mobile") || ""),
      website: String(form.get("website") || ""), monthlyVolume: String(form.get("monthlyVolume") || ""),
      challenges: selectedChallenges, notes: String(form.get("notes") || ""),
      queryString: `?${recordedAttribution.toString()}`, landingUrl: firstLandingUrl.current || window.location.href,
      referrerUrl: document.referrer || "", firstVisitAt: firstVisit.current || new Date().toISOString(),
      source: recordedAttribution.get("source") || "", campaign: recordedAttribution.get("campaign") || "",
      utmSource: recordedAttribution.get("utm_source") || "", utmMedium: recordedAttribution.get("utm_medium") || "",
      utmCampaign: recordedAttribution.get("utm_campaign") || "", utmTerm: recordedAttribution.get("utm_term") || "",
      utmContent: recordedAttribution.get("utm_content") || "", gclid: recordedAttribution.get("gclid") || "",
      websiteCheck: String(form.get("websiteCheck") || ""),
    };
    try {
      const response = await apiRequest("POST", "/api/contract-partner-enquiries", payload);
      if (!response.ok) throw new Error("We couldn't send that just now. Please try again.");
      setSubmitted(true); track("form_complete", { campaign: payload.campaign });
    } catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message : "Something went wrong. Please try again."); }
    finally { setSending(false); }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f4f2ed] text-[#152326] selection:bg-[#d7ef46] selection:text-[#152326]">
      <header className="sticky top-0 z-40 border-b border-[#d8d8d0] bg-[#f4f2ed]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 lg:px-8">
          <img src={sbsLogo} alt="Select Branding Solutions" className="h-11 w-auto object-contain" />
          <div className="hidden items-center gap-6 md:flex">
            <a href="mailto:info@selectbranding.co.uk" onClick={() => track("email_click")} className="text-sm font-medium text-[#536164]">Email the production team</a>
            <button onClick={scrollToForm} data-testid="button-header-fit" className="rounded-sm bg-[#d7ef46] px-5 py-3 text-xs font-black tracking-[.08em] text-[#152326] transition-transform hover:-translate-y-0.5">SEE IF WE'RE A GOOD FIT <ArrowRight className="ml-2 inline h-4 w-4" /></button>
          </div>
          <button aria-label="Open menu" onClick={() => setMenuOpen(!menuOpen)} className="md:hidden"><Menu /></button>
        </div>
        {menuOpen && <div className="border-t border-[#d8d8d0] px-5 py-4 md:hidden"><button onClick={() => { setMenuOpen(false); scrollToForm(); }} className="w-full bg-[#d7ef46] px-4 py-3 text-left text-xs font-black">SEE IF WE'RE A GOOD FIT <ArrowRight className="inline h-4 w-4" /></button></div>}
      </header>

      <main>
        <section className="relative overflow-hidden bg-[#17383a] text-[#f4f2ed]">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[1fr_.92fr] lg:items-center lg:px-8 lg:py-24">
            <div className="relative z-10">
              <p className="mb-6 text-xs font-bold uppercase tracking-[.2em] text-[#d7ef46]">{hero.eyebrow}</p>
              <h1 className="max-w-3xl text-[clamp(2.7rem,7vw,6.2rem)] font-black leading-[.94] tracking-[-.06em]">{hero.title}<br /><span className="text-[#d7ef46]">{hero.emphasis}</span></h1>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-[#d4dfda]">{hero.support || "Outsource to a dedicated UK team built to support businesses selling branded clothing, workwear, sportswear, schoolwear and merchandise."}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button onClick={() => { track("primary_cta_click"); scrollToForm(); }} data-testid="button-hero-fit" className="bg-[#d7ef46] px-6 py-4 text-sm font-black tracking-[.08em] text-[#152326] hover:bg-[#e3f66b]">SEE IF WE'RE A GOOD FIT <ArrowRight className="ml-2 inline h-4 w-4" /></button>
                <a href="#how-it-works" onClick={() => track("secondary_cta_click")} data-testid="button-hero-how" className="border border-[#78918c] px-6 py-4 text-center text-sm font-bold text-[#f4f2ed] hover:border-[#d7ef46]">SEE HOW IT WORKS <ChevronDown className="ml-2 inline h-4 w-4" /></a>
              </div>
              <p className="mt-5 text-xs text-[#a9bfba]">For businesses with regular embroidery requirements. Not one-off garment jobs.</p>
            </div>
            <div className="relative">
              <div className="absolute -inset-5 border border-[#d7ef46]/25 lg:-inset-8" />
              <img src={photos[activePhoto].src} alt={photos[activePhoto].alt} className="relative aspect-[4/5] w-full object-cover sm:aspect-[5/4] lg:aspect-[4/5]" />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#10292b] p-5 pt-20"><p className="text-sm font-semibold">{photos[activePhoto].label}</p><div className="mt-4 flex gap-2">{photos.map((photo, index) => <button key={photo.src} aria-label={`Show production image ${index + 1}`} onClick={() => setActivePhoto(index)} className={`h-1.5 transition-all ${index === activePhoto ? "w-10 bg-[#d7ef46]" : "w-5 bg-[#f4f2ed]/40"}`} />)}</div></div>
            </div>
          </div>
          <div className="border-t border-[#41605f]">
            <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-[#41605f] lg:grid-cols-4 lg:divide-y-0">
              {[["38", "EMBROIDERY HEADS"], ["24/6", "PRODUCTION"], ["3–4 DAYS", "STANDARD LEAD TIME"], ["80+", "CONTRACT PARTNERS"]].map(([stat, label]) => <div key={label} className="px-5 py-6 lg:px-8"><strong className="block text-3xl font-black tracking-tight text-[#d7ef46]">{stat}</strong><span className="text-[10px] font-bold tracking-[.14em] text-[#b3c4c0]">{label}</span></div>)}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:gap-20">
            <div><p className="mb-4 text-xs font-black uppercase tracking-[.2em] text-[#64746e]">The problem is a good one</p><h2 className="text-4xl font-black leading-[.98] tracking-[-.04em] lg:text-6xl">What's stopping you growing?</h2></div>
            <div><p className="text-xl leading-relaxed text-[#536164]">For many successful branded clothing businesses, the problem eventually isn't finding customers.</p><p className="mt-2 text-2xl font-black">It's producing everything they've sold.</p><div className="mt-9 grid gap-3 sm:grid-cols-2">{[["NOT ENOUGH CAPACITY?", "Use our capacity instead."], ["CAN'T RECRUIT OPERATORS?", "Use our production team instead."], ["THINKING ABOUT ANOTHER MACHINE?", "Increase capacity without increasing fixed overhead."], ["SPENDING EVENINGS EMBROIDERING?", "Spend your time growing the business instead."], ["WORRIED ABOUT DOWNTIME?", "Build resilience into your business."], ["SUPPLIER CAN'T KEEP UP?", "Our standard production lead time is 3–4 working days."]].map(([title, copy]) => <div key={title} className="border-t-2 border-[#17383a] py-5"><h3 className="text-sm font-black tracking-wide">{title}</h3><p className="mt-2 text-sm leading-relaxed text-[#64746e]">{copy}</p></div>)}</div></div>
          </div>
        </section>

        <section className="bg-[#d7ef46] px-5 py-20 lg:py-28">
          <div className="mx-auto max-w-5xl"><p className="text-xs font-black uppercase tracking-[.2em] text-[#48615a]">The commercial choice</p><h2 className="mt-4 max-w-3xl text-5xl font-black leading-[.92] tracking-[-.06em] lg:text-8xl">Stop building an embroidery business.<br /><span className="text-[#17383a]">Build a sales business.</span></h2><div className="mt-10 grid gap-8 lg:grid-cols-2"><p className="text-lg leading-relaxed text-[#304d4b]">A lot of branded clothing businesses start selling garments, then buy an embroidery machine. Sales increase. They buy another machine. Then an operator. Then more space. Then somebody goes on holiday. A machine breaks down.</p><p className="text-lg font-bold leading-relaxed text-[#304d4b]">Before long, they're running a manufacturing business rather than concentrating on sales.<br /><span className="mt-4 block text-3xl font-black text-[#17383a]">There is another way.</span></p></div><div className="mt-12 flex flex-col items-start justify-between gap-6 border-t border-[#9db62b] pt-8 sm:flex-row sm:items-center"><p className="text-4xl font-black tracking-[-.04em]">Sell more. <span className="text-[#17383a]">Produce less.</span></p><button onClick={scrollToForm} data-testid="button-model-fit" className="bg-[#17383a] px-6 py-4 text-sm font-black tracking-[.08em] text-[#f4f2ed]">TALK TO US ABOUT YOUR PRODUCTION <ArrowRight className="ml-2 inline h-4 w-4" /></button></div></div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28"><div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[.2em] text-[#64746e]">Evidence, not theatre</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] lg:text-6xl">You don't need to build this.<br /><span className="text-[#6f870e]">We've already built it.</span></h2><p className="mt-5 text-lg leading-relaxed text-[#536164]">Instead of investing in more embroidery machinery, production space and operators, plug your business into our existing production operation.</p></div><div className="mt-10 aspect-video overflow-hidden bg-[#17383a] shadow-xl">{videoStarted ? <div ref={videoPlayerNode} title="Select Branding Solutions production operation" className="h-full w-full" /> : <button type="button" onClick={() => { setVideoStarted(true); track("video_play"); }} data-testid="button-play-production-video" className="group relative h-full w-full overflow-hidden text-left"><img src={floorFour} loading="lazy" alt="Select Branding embroidery machinery in production" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /><span className="absolute inset-0 bg-[#10292b]/35" /><span className="absolute inset-0 flex items-center justify-center"><span className="flex items-center gap-3 bg-[#d7ef46] px-6 py-4 text-sm font-black tracking-[.08em] text-[#152326]">WATCH THE PRODUCTION VIDEO <Play className="h-4 w-4 fill-current" /></span></span></button>}</div><div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-black uppercase tracking-[.1em] text-[#64746e]"><span>38 Heads</span><span>|</span><span>24/6 Production</span><span>|</span><span>3–4 Working Days</span><span>|</span><span>UK Production</span></div></section>

        <section className="bg-[#17383a] px-5 py-20 text-[#f4f2ed] lg:py-28"><div className="mx-auto max-w-7xl"><div className="grid gap-12 lg:grid-cols-2"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#d7ef46]">Your production department</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] lg:text-6xl">Serious production needs serious machinery.</h2><p className="mt-6 max-w-lg text-lg leading-relaxed text-[#c0d1cc]">We use Barudan multi-head embroidery machinery throughout our production operation. We regard Barudan as the Rolls-Royce of industrial embroidery machinery — which is why we use it.</p></div><div className="grid grid-cols-2 gap-px bg-[#41605f]"><div className="bg-[#204648] p-6"><Factory className="mb-10 text-[#d7ef46]" /><p className="text-2xl font-black">38</p><p className="mt-1 text-xs uppercase tracking-widest text-[#b7c8c3]">Embroidery heads</p></div><div className="bg-[#204648] p-6"><Clock3 className="mb-10 text-[#d7ef46]" /><p className="text-2xl font-black">24/6</p><p className="mt-1 text-xs uppercase tracking-widest text-[#b7c8c3]">UK production</p></div><div className="bg-[#204648] p-6"><ShieldCheck className="mb-10 text-[#d7ef46]" /><p className="text-2xl font-black">3–4</p><p className="mt-1 text-xs uppercase tracking-widest text-[#b7c8c3]">Working day lead time</p></div><div className="bg-[#204648] p-6"><Check className="mb-10 text-[#d7ef46]" /><p className="text-2xl font-black">80+</p><p className="mt-1 text-xs uppercase tracking-widest text-[#b7c8c3]">Contract partners</p></div></div></div></div></section>

        <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#64746e]">A straightforward operation</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] lg:text-6xl">Outsourcing shouldn't<br />create more work.</h2></div><p className="max-w-xs text-sm leading-relaxed text-[#64746e]">Simple in. Finished garments out. Your customer relationship stays yours.</p></div><div className="mt-12 grid gap-0 md:grid-cols-4">{[["01", "SEND US THE JOB", "Submit the production order through your Contract Partner portal."], ["02", "WE SCHEDULE IT", "Our production system schedules the job into our operation."], ["03", "WE PRODUCE IT", "Our team embroider the garments using multi-head machinery."], ["04", "WE RETURN IT", "Completed garments are dispatched back to you or onwards to your customer."]].map(([number, title, copy], index) => <div key={number} className="border-l-2 border-[#d7ef46] px-5 py-5 md:min-h-[230px] md:border-l-0 md:border-t-2 md:px-6"><span className="text-xs font-black text-[#6f870e]">{number}</span><h3 className="mt-14 text-sm font-black">{title}</h3><p className="mt-3 text-sm leading-relaxed text-[#64746e]">{copy}</p>{index < 3 && <ArrowRight className="mt-5 hidden text-[#6f870e] md:block" />}</div>)}</div></section>

        <section className="border-y border-[#d8d8d0] bg-[#ebe9e2] px-5 py-20 lg:py-24"><div className="mx-auto max-w-7xl"><div className="grid gap-10 lg:grid-cols-2"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#64746e]">The grown-up way to outsource</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] lg:text-6xl">You can build the infrastructure yourself.<br /><span className="text-[#6f870e]">Or use ours.</span></h2></div><div className="grid gap-4 sm:grid-cols-2"><div className="border border-[#c8c9c0] bg-[#f4f2ed] p-6"><h3 className="text-xs font-black uppercase tracking-widest text-[#64746e]">Build it yourself</h3>{["Buy and finance machinery", "Recruit and train operators", "Find space and maintain machines", "Cover sickness and holidays", "Manage production and breakdowns", "Increase fixed overhead"].map(item => <p key={item} className="mt-4 flex gap-2 text-sm text-[#64746e]"><X className="h-4 w-4 shrink-0 text-[#a76a52]" />{item}</p>)}</div><div className="bg-[#17383a] p-6 text-[#f4f2ed]"><h3 className="text-xs font-black uppercase tracking-widest text-[#d7ef46]">Use Select</h3>{["Use our 38 embroidery heads", "Use our production team", "Use our factory and Barudan machinery", "Access capacity when needed", "Increase or decrease with demand", "Concentrate on customers and sales"].map(item => <p key={item} className="mt-4 flex gap-2 text-sm text-[#d4dfda]"><Check className="h-4 w-4 shrink-0 text-[#d7ef46]" />{item}</p>)}</div></div></div><div className="mt-14 border-t border-[#c8c9c0] pt-10"><p className="text-5xl font-black tracking-[-.06em] lg:text-7xl">You sell it.<br /><span className="text-[#6f870e]">We embroider it.</span></p></div></div></section>

        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28"><div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#64746e]">Who we work with</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] lg:text-6xl">Built for businesses selling branded clothing.</h2></div><div className="grid gap-0 sm:grid-cols-2">{[["WORKWEAR SUPPLIERS", "Increase embroidery capacity without increasing production overhead."], ["SPORTSWEAR & TEAMWEAR", "Sell more kits while we handle production."], ["SCHOOLWEAR BUSINESSES", "Access additional capacity during seasonal peaks."], ["PROMOTIONAL CLOTHING", "Offer embroidery without building a department."], ["PRINTERS & SIGN COMPANIES", "Add embroidery without investing in equipment."], ["ONLINE CLOTHING BUSINESSES", "Concentrate on ecommerce, marketing and sales."], ["EMBROIDERY BUSINESSES", "Use us for overflow, peaks or resilience."]].map(([title, copy]) => <div key={title} className="border-t border-[#bfc4bc] py-6 pr-5"><h3 className="text-xs font-black tracking-widest">{title}</h3><p className="mt-2 text-sm leading-relaxed text-[#64746e]">{copy}</p></div>)}</div></div></section>

        <section className="bg-[#17383a] px-5 py-20 text-[#f4f2ed] lg:py-28"><div className="mx-auto max-w-6xl"><div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[.2em] text-[#d7ef46]">A partner, not a job shop</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] lg:text-6xl">We'll be upfront.<br /><span className="text-[#d7ef46]">We don't work with everyone.</span></h2><p className="mt-6 text-lg leading-relaxed text-[#c0d1cc]">We're not trying to become the embroidery supplier for every business in the UK. We work best with businesses that value reliable production and want a genuine production partner.</p></div><div className="mt-12 grid gap-10 md:grid-cols-2"><div><h3 className="text-sm font-black text-[#d7ef46]">WE'RE PROBABLY A GOOD FIT IF YOU:</h3>{["Sell branded clothing, workwear, sportswear, schoolwear or merchandise", "Have regular embroidery requirements", "Want to grow and need additional capacity", "Give clear production instructions", "Value reliability and consistency", "Want a long-term production partner"].map(item => <p key={item} className="mt-4 flex gap-3 text-sm text-[#d4dfda]"><Check className="h-4 w-4 shrink-0 text-[#d7ef46]" />{item}</p>)}</div><div><h3 className="text-sm font-black text-[#d7ef46]">WE'RE PROBABLY NOT RIGHT IF:</h3>{["You only have occasional tiny orders", "Everything is always urgent", "Instructions regularly change after submission", "Price is the only factor", "You need six polos tomorrow afternoon"].map(item => <p key={item} className="mt-4 flex gap-3 text-sm text-[#d4dfda]"><X className="h-4 w-4 shrink-0 text-[#e3a17d]" />{item}</p>)}</div></div><p className="mt-12 max-w-2xl border-t border-[#41605f] pt-8 text-xl font-bold leading-relaxed">If we're right for each other, we want to become the production partner you use for years — not the supplier you use for one job.</p><button onClick={scrollToForm} data-testid="button-fit-section" className="mt-8 bg-[#d7ef46] px-6 py-4 text-sm font-black tracking-[.08em] text-[#152326]">SEE IF WE'RE A GOOD FIT <ArrowRight className="ml-2 inline h-4 w-4" /></button></div></section>

        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8"><div className="grid gap-5 md:grid-cols-2"><div className="bg-[#d7ef46] p-8 lg:p-12"><p className="text-xs font-black uppercase tracking-widest text-[#48615a]">The portal</p><h2 className="mt-4 text-3xl font-black tracking-tight">Built for businesses that outsource production.</h2><p className="mt-4 leading-relaxed text-[#304d4b]">Submit jobs, upload artwork, provide instructions, track production, repeat orders and keep your records together — without another trail of emails and spreadsheets.</p><a href="/portal-preview" target="_blank" rel="noreferrer" onClick={() => track("portal_demo_click")} data-testid="button-portal-demo" className="mt-8 inline-block border-2 border-[#17383a] px-5 py-3 text-xs font-black">VIEW THE PRODUCTION PORTAL <Play className="ml-2 inline h-4 w-4" /></a></div><div className="bg-[#ebe9e2] p-8 lg:p-12"><p className="text-xs font-black uppercase tracking-widest text-[#64746e]">Transparent pricing</p><h2 className="mt-4 text-3xl font-black tracking-tight">September 2026 rates, in plain sight.</h2><p className="mt-4 leading-relaxed text-[#536164]">Per-unit pricing based on quantity and stitch count. DTF Print & Apply is priced by size. No hidden fees.</p><div className="mt-7 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[#c8c9c0] text-xs uppercase tracking-widest text-[#64746e]"><th className="pb-3">Qty</th><th className="pb-3">≤5k</th><th className="pb-3">≤10k</th><th className="pb-3">≤20k</th></tr></thead><tbody>{PRICING_2026.filter(t => t.maxQty !== null).slice(0, 4).map(tier => <tr key={tier.minQty} className="border-b border-[#d8d8d0]"><td className="py-3 font-bold">{tier.minQty}–{tier.maxQty}</td>{[5000, 10000, 20000].map(stitch => { const price = tier.prices.find(p => p.maxStitches === stitch)?.price; return <td key={stitch} className="py-3">{typeof price === "number" ? `£${(price + SEPTEMBER_PRICE_INCREASE).toFixed(2)}` : "POA"}</td>; })}</tr>)}</tbody></table></div><div className="mt-8 border-t border-[#c8c9c0] pt-6"><h3 className="text-sm font-black">DTF PRINT &amp; APPLY</h3><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[#c8c9c0] text-[#64746e]"><th className="pb-2">Qty</th><th className="pb-2">A6</th><th className="pb-2">A5</th><th className="pb-2">A4</th><th className="pb-2">A3</th></tr></thead><tbody>{PRINT_PRICING_2026.map((tier) => <tr key={tier.minQty} className="border-b border-[#d8d8d0]"><td className="py-2 font-bold">{tier.maxQty === null ? `${tier.minQty}+` : tier.minQty === 0 ? `Up to ${tier.maxQty}` : `${tier.minQty}–${tier.maxQty}`}</td>{(["A6", "A5", "A4", "A3"] as const).map(size => <td key={size} className="py-2">£{(tier.prices[size] + SEPTEMBER_PRICE_INCREASE).toFixed(2)}</td>)}</tr>)}</tbody></table></div></div><p className="mt-4 text-xs text-[#64746e]">All prices exclude VAT. Effective 1st September 2026. Minimum order 6 items per design — smaller orders are charged at the 6-item price.</p></div></div></section>

        <section id="qualification-form" className="scroll-mt-24 bg-[#d7ef46] px-5 py-20 lg:py-28"><div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[.82fr_1.18fr]"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#48615a]">The next sensible step</p><h2 className="mt-4 text-5xl font-black leading-[.92] tracking-[-.06em] lg:text-7xl">Could we become your production partner?</h2><p className="mt-7 max-w-md text-lg leading-relaxed text-[#304d4b]">Tell us a little about your business and we'll tell you whether we think we're a good fit.</p><p className="mt-8 text-sm font-bold text-[#48615a]">We don't work with everyone. That's exactly why our Contract Partners trust us.</p></div><div className="bg-[#f4f2ed] p-6 shadow-xl sm:p-9">{submitted ? <div className="py-12 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center bg-[#d7ef46]"><Check className="h-7 w-7" /></div><h3 className="mt-6 text-2xl font-black">Thanks — we'll take a look.</h3><p className="mx-auto mt-4 max-w-sm leading-relaxed text-[#64746e]">We'll review what you've told us and get in touch to discuss whether Select could be the right production partner for your business.</p></div> : <form onSubmit={onSubmit} onFocus={() => { if (!formStarted) { setFormStarted(true); track("form_start"); } }} data-testid="form-contract-partner-enquiry" className="space-y-5"><div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true"><label>Leave this field blank<input name="websiteCheck" tabIndex={-1} autoComplete="off" /></label></div><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-bold">Name *<input required name="name" data-testid="input-enquiry-name" className="mt-2 w-full border border-[#c8c9c0] bg-transparent px-4 py-3 outline-none focus:border-[#17383a]" /></label><label className="text-sm font-bold">Business name *<input required name="businessName" data-testid="input-enquiry-business" className="mt-2 w-full border border-[#c8c9c0] bg-transparent px-4 py-3 outline-none focus:border-[#17383a]" /></label></div><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-bold">Email *<input required type="email" name="email" data-testid="input-enquiry-email" className="mt-2 w-full border border-[#c8c9c0] bg-transparent px-4 py-3 outline-none focus:border-[#17383a]" /></label><label className="text-sm font-bold">Mobile number<input type="tel" name="mobile" data-testid="input-enquiry-mobile" className="mt-2 w-full border border-[#c8c9c0] bg-transparent px-4 py-3 outline-none focus:border-[#17383a]" /></label></div><label className="block text-sm font-bold">Website<input name="website" type="url" placeholder="https://" data-testid="input-enquiry-website" className="mt-2 w-full border border-[#c8c9c0] bg-transparent px-4 py-3 outline-none focus:border-[#17383a]" /></label><label className="block text-sm font-bold">Approximately how many garments do you currently embroider or outsource each month?<select required name="monthlyVolume" data-testid="select-monthly-volume" defaultValue="" className="mt-2 w-full border border-[#c8c9c0] bg-[#f4f2ed] px-4 py-3 outline-none"><option value="" disabled>Select a range</option>{["Under 100", "100–250", "250–500", "500–1,000", "1,000–2,500", "2,500–5,000", "5,000+"].map(item => <option key={item}>{item}</option>)}</select></label><fieldset><legend className="text-sm font-bold">What's your biggest production challenge?</legend><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{challenges.map(challenge => <label key={challenge} className={`cursor-pointer border px-3 py-2 text-xs ${selectedChallenges.includes(challenge) ? "border-[#17383a] bg-[#17383a] text-[#f4f2ed]" : "border-[#c8c9c0]"}`}><input type="checkbox" className="sr-only" checked={selectedChallenges.includes(challenge)} onChange={() => toggleChallenge(challenge)} />{challenge}</label>)}</div></fieldset><label className="block text-sm font-bold">Anything else we should know?<textarea name="notes" rows={3} data-testid="textarea-enquiry-notes" className="mt-2 w-full resize-none border border-[#c8c9c0] bg-transparent px-4 py-3 outline-none focus:border-[#17383a]" /></label>{error && <p role="alert" className="text-sm font-bold text-[#a14f39]">{error}</p>}<button disabled={sending} type="submit" data-testid="button-submit-contract-enquiry" className="w-full bg-[#17383a] px-6 py-4 text-sm font-black tracking-[.08em] text-[#f4f2ed] disabled:opacity-60">{sending ? "SENDING..." : "SEE IF WE'RE A GOOD FIT"} <ArrowRight className="ml-2 inline h-4 w-4" /></button><p className="text-center text-xs text-[#64746e]">Your details are used to respond to this enquiry. We don't sell your information. Read our <a className="underline underline-offset-2" href="/privacy">privacy notice</a>.</p></form>}</div></div></section>

        <section className="bg-[#17383a] px-5 py-20 text-center text-[#f4f2ed] lg:py-28"><p className="text-xs font-black uppercase tracking-[.2em] text-[#d7ef46]">Your next production decision</p><h2 className="mx-auto mt-5 max-w-4xl text-5xl font-black leading-[.92] tracking-[-.06em] lg:text-8xl">How much could you sell if production wasn't the problem?</h2><p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-[#c0d1cc]">You grow the business. We'll take care of the embroidery.</p><button onClick={scrollToForm} data-testid="button-final-fit" className="mt-9 bg-[#d7ef46] px-7 py-4 text-sm font-black tracking-[.08em] text-[#152326]">SEE IF WE'RE A GOOD FIT <ArrowRight className="ml-2 inline h-4 w-4" /></button></section>
      </main>
      <footer className="bg-[#10292b] px-5 py-8 text-[#b7c8c3]"><div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between"><img src={sbsLogo} alt="Select Branding Solutions" className="h-9 w-auto brightness-0 invert opacity-80" /><p>© Select Branding Solutions · Contract Embroidery Division</p><div className="flex gap-4"><a href="mailto:hello@selectbranding.co.uk" onClick={() => track("email_click")}>Email the team</a><a href="/privacy">Privacy</a></div></div></footer>
      <button onClick={scrollToForm} data-testid="button-mobile-sticky-fit" className="fixed bottom-0 left-0 right-0 z-30 bg-[#d7ef46] px-4 py-3 text-center text-xs font-black tracking-[.08em] text-[#152326] shadow-lg md:hidden">SEE IF WE'RE A GOOD FIT <ArrowRight className="ml-2 inline h-4 w-4" /></button>
    </div>
  );
}