import { describe, it, expect } from 'vitest';
import { buildCommunitySignals } from '../trust';

// azzv residual: press evidence needs a real OUTLET in a coverage
// construction — never insurance/clinical phrases, directory listings or
// street names.
const BIZ = 'Brite Smiles Dentistry';
function community(text: string, name = BIZ) {
  const c = buildCommunitySignals(text, null, name);
  return {
    news: c.find(s => s.name === 'Local news mentions')!,
    awards: c.find(s => s.name === 'Awards or recognition')!,
  };
}

describe('azzv press evidence — negatives', () => {
  it.each([
    'Brite Smiles Dentistry treatment is covered by insurance.',
    'Brite Smiles Dentistry is covered by Delta Dental insurance and Medicare.',
    'Brite Smiles Dentistry provides post-op care after every extraction.',
    'Brite Smiles Dentistry is listed on Yelp with 200 reviews.',
    'Brite Smiles Dentistry is on Sun Street, which was named after the old mill.',
    'Brite Smiles Dentistry was featured on Yelp and Google.',
    'Brite Smiles Dentistry is near the Post Office on Main Street.',
    'According to WHO guidelines, Brite Smiles Dentistry sterilises tools.',
  ])('not Local news good: %s', (text) => {
    expect(community(text).news.status).not.toBe('good');
  });

  it('a business whose own name contains an outlet word is not a publication', () => {
    const { news } = community('Lone Star Dental is listed among clinics in Austin.', 'Lone Star Dental');
    expect(news.status).not.toBe('good');
    const { news: n2 } = community('Express Dental was named after its founder.', 'Express Dental');
    expect(n2.status).not.toBe('good');
  });

  it('awards: "board-certified" is a credential (warning), not an award', () => {
    expect(community('Brite Smiles Dentistry has a board-certified orthodontist.').awards.status).toBe('warning');
    expect(community('Brite Smiles Dentistry dentists are certified by the state board.').awards.status).toBe('warning');
  });
});

describe('azzv press evidence — positives', () => {
  it.each([
    'Brite Smiles Dentistry was featured in the Dallas Morning News.',
    'According to the Dallas Morning News, Brite Smiles Dentistry is the best.',
    'Brite Smiles Dentistry was profiled by The Washington Post in 2023.',
    'The Austin American-Statesman reported that Brite Smiles Dentistry opened a second office.',
    'Brite Smiles Dentistry was interviewed on WFAA about dental anxiety.',
    'Brite Smiles Dentistry was covered by KXAS-TV last spring.',
    'Brite Smiles Dentistry was featured in The Sun.',
    'Brite Smiles Dentistry was mentioned by the BBC.',
  ])('Local news good: %s', (text) => {
    expect(community(text).news.status).toBe('good');
  });

  it('named award stays good', () => {
    expect(community('Brite Smiles Dentistry won the 2024 Best Dentist award.').awards.status).toBe('good');
  });

  it('negated press is not evidence', () => {
    expect(community('Brite Smiles Dentistry has never been featured in the Dallas Morning News.').news.status).not.toBe('good');
  });
});
