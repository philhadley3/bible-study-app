export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const book = searchParams.get("book") || "";
  const chapter = searchParams.get("chapter") || "";

  // Mock data for now (Darby sample text).
  // Next step: replace this with real Darby chapter data from the backend/service.
  const mock: Record<string, { translation: string; reference: string; verses: { v: number; t: string }[] }> = {
    "John-3": {
      translation: "Darby",
      reference: "John 3",
      verses: [
        { v: 16, t: "For God so loved the world, that he gave his only-begotten Son, that whosoever believes on him may not perish, but have life eternal." },
        { v: 17, t: "For God has not sent his Son into the world that he may judge the world, but that the world may be saved through him." },
        { v: 18, t: "He that believes on him is not judged; but he that does not believe has been already judged, because he has not believed on the name of the only-begotten Son of God." },
      ],
    },
    "Genesis-1": {
      translation: "Darby",
      reference: "Genesis 1",
      verses: [
        { v: 1, t: "In the beginning God created the heavens and the earth." },
        { v: 2, t: "And the earth was waste and empty, and darkness was on the face of the deep, and the Spirit of God was hovering over the face of the waters." },
        { v: 3, t: "And God said, Let there be light. And there was light." },
      ],
    },
  };

  const key = `${book}-${chapter}`;
  const payload = mock[key] ?? {
    translation: "Darby",
    reference: book && chapter ? `${book} ${chapter}` : "—",
    verses: [],
  };

  return Response.json(payload);
}
