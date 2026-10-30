export type Sentiment = "positive" | "neutral" | "negative";

export type AnalysisResult = {
  brandMentioned: boolean;
  position: number | null;
  isPrimaryRecommendation: boolean;
  sentiment: Sentiment;
  exactQuote: string | null;
  confidenceScore: number;
};

const POSITIVE_SIGNALS = [
  "recommend", "excellent", "best", "top", "trusted", "outstanding",
  "highly rated", "great", "fantastic", "exceptional", "leading",
  "preferred", "award", "five star", "5 star", "highly regarded",
  "well known", "reputable", "experienced", "professional", "quality"
];

const NEGATIVE_SIGNALS = [
  "avoid", "poor", "complaint", "bad", "negative review", "not recommend",
  "disappointing", "terrible", "worst", "problematic", "issue",
  "lawsuit", "fine", "penalty", "warning", "low rated", "unprofessional"
];

const PRIMARY_SIGNALS = [
  "first", "top choice", "number one", "best option", "primary",
  "highly recommend", "would recommend", "suggest", "go with",
  "start with", "consider", "ideal", "perfect choice"
];

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function findMentionPosition(text: string, businessName: string): number | null {
  const normalisedText = normalise(text);
  const normalisedName = normalise(businessName);
  const sentences = normalisedText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const totalSentences = sentences.length;
  if (totalSentences === 0) return null;

  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i].includes(normalisedName)) {
      const relativePosition = i / totalSentences;
      if (relativePosition < 0.33) return 1;
      if (relativePosition < 0.66) return 2;
      return 3;
    }
  }
  return null;
}

function extractQuote(text: string, businessName: string): string | null {
  const normalisedName = normalise(businessName);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  for (const sentence of sentences) {
    if (normalise(sentence).includes(normalisedName)) {
      return sentence.trim().slice(0, 200);
    }
  }
  return null;
}

function detectSentiment(text: string, businessName: string): Sentiment {
  const normalisedText = normalise(text);
  const normalisedName = normalise(businessName);
  const sentences = normalisedText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const relevantSentences = sentences.filter(s => s.includes(normalisedName));
  const contextText = relevantSentences.join(" ") || normalisedText;

  let positiveCount = 0;
  let negativeCount = 0;

  for (const signal of POSITIVE_SIGNALS) {
    if (contextText.includes(signal)) positiveCount++;
  }
  for (const signal of NEGATIVE_SIGNALS) {
    if (contextText.includes(signal)) negativeCount++;
  }

  if (positiveCount > negativeCount) return "positive";
  if (negativeCount > positiveCount) return "negative";
  return "neutral";
}

function detectPrimaryRecommendation(text: string, businessName: string): boolean {
  const normalisedText = normalise(text);
  const normalisedName = normalise(businessName);
  const sentences = normalisedText.split(/[.!?]+/).filter(s => s.trim().length > 0);

  for (let i = 0; i < Math.min(3, sentences.length); i++) {
    const sentence = sentences[i];
    if (sentence.includes(normalisedName)) {
      for (const signal of PRIMARY_SIGNALS) {
        if (sentence.includes(signal)) return true;
      }
      return true;
    }
  }
  return false;
}

function calculateConfidence(
  brandMentioned: boolean,
  responseLength: number,
  position: number | null
): number {
  if (!brandMentioned) return 0.95;
  let confidence = 0.7;
  if (responseLength > 200) confidence += 0.1;
  if (responseLength > 500) confidence += 0.1;
  if (position === 1) confidence += 0.1;
  return Math.min(1, confidence);
}

export function analyseResponse(
  responseText: string,
  businessName: string
): AnalysisResult {
  if (!responseText || !businessName) {
    return {
      brandMentioned: false,
      position: null,
      isPrimaryRecommendation: false,
      sentiment: "neutral",
      exactQuote: null,
      confidenceScore: 0,
    };
  }

  const normalisedText = normalise(responseText);
  const normalisedName = normalise(businessName);

  // Check for variations of the business name
  const nameWords = normalisedName.split(" ").filter(w => w.length > 2);
  const brandMentioned =
    normalisedText.includes(normalisedName) ||
    (nameWords.length > 1 && nameWords.every(word => normalisedText.includes(word)));

  if (!brandMentioned) {
    return {
      brandMentioned: false,
      position: null,
      isPrimaryRecommendation: false,
      sentiment: "neutral",
      exactQuote: null,
      confidenceScore: 0.95,
    };
  }

  const position = findMentionPosition(responseText, businessName);
  const isPrimaryRecommendation = detectPrimaryRecommendation(responseText, businessName);
  const sentiment = detectSentiment(responseText, businessName);
  const exactQuote = extractQuote(responseText, businessName);
  const confidenceScore = calculateConfidence(true, responseText.length, position);

  return {
    brandMentioned,
    position,
    isPrimaryRecommendation,
    sentiment,
    exactQuote,
    confidenceScore,
  };
}