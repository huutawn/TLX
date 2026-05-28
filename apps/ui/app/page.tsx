export default function Home() {
  return (
    <div className="min-h-full bg-neutral-950 text-neutral-100">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="flex flex-col gap-2 border-b border-white/10 pb-6">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">
            TLX
          </p>
          <h1 className="text-3xl font-semibold tracking-normal sm:text-5xl">
            Dashboard
          </h1>
          <p className="max-w-2xl text-base leading-7 text-neutral-300">
            Giao dien quan tri cho CLI TLX. UI nay duoc build bang Next.js va
            co the duoc serve truc tiep tu lenh `tlx ui:start`.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            ["Runtime", "Bun"],
            ["CLI", "Commander + Express"],
            ["UI", "Next.js + TypeScript"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/10 p-5">
              <p className="text-sm text-neutral-400">{label}</p>
              <p className="mt-2 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
