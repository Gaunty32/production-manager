import sbsLogo from "@assets/logo_transparent.png";

export default function Privacy() {
  return (
    <main className="min-h-screen bg-[#f4f2ed] text-[#152326]">
      <header className="border-b border-[#d8d8d0] bg-[#f4f2ed]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <a href="/demo-access-preview" aria-label="Return to Contract Embroidery preview">
            <img src={sbsLogo} alt="Select Branding Solutions" className="h-10 w-auto" />
          </a>
          <a href="mailto:info@selectbranding.co.uk" className="text-sm font-semibold text-[#536164]">Contact us</a>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <p className="text-xs font-black uppercase tracking-[.2em] text-[#6f870e]">Select Branding Solutions</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-5xl">Privacy notice</h1>
        <p className="mt-6 text-lg leading-relaxed text-[#536164]">This notice explains how we use personal information submitted through our Contract Embroidery Division enquiry form.</p>
        <div className="mt-12 space-y-10 text-[#3d4c4f]">
          <section><h2 className="text-xl font-black text-[#152326]">What we collect</h2><p className="mt-3 leading-relaxed">We collect the contact and business information you choose to provide, including your name, business name, email address, mobile number, website, estimated monthly embroidery volume, production challenges and any additional notes.</p></section>
          <section><h2 className="text-xl font-black text-[#152326]">Campaign information</h2><p className="mt-3 leading-relaxed">To understand which marketing activity generated an enquiry, we may also collect the first landing page, referring website, campaign parameters, UTM parameters, Google Click ID and the time of first visit. We retain only the attribution parameters needed for campaign reporting.</p></section>
          <section><h2 className="text-xl font-black text-[#152326]">How we use it</h2><p className="mt-3 leading-relaxed">We use this information to assess whether Select Branding Solutions may be a suitable production partner, respond to your enquiry and understand the performance of our marketing. We do not sell your personal information.</p></section>
          <section><h2 className="text-xl font-black text-[#152326]">Who receives it</h2><p className="mt-3 leading-relaxed">Your enquiry is stored securely in our business systems and may be shared with the Select team and our customer relationship management provider so that we can respond to you.</p></section>
          <section><h2 className="text-xl font-black text-[#152326]">Your choices</h2><p className="mt-3 leading-relaxed">You may ask us to access, correct or delete the personal information we hold about you, or object to its use for marketing. Email <a className="font-semibold underline" href="mailto:info@selectbranding.co.uk">info@selectbranding.co.uk</a> with your request.</p></section>
          <section><h2 className="text-xl font-black text-[#152326]">Updates to this notice</h2><p className="mt-3 leading-relaxed">We may update this notice when our services or data practices change. The latest version will always be available at this address.</p></section>
        </div>
      </article>
    </main>
  );
}