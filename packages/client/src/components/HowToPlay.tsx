interface Section {
  heading: string;
  body?: string;
  items?: Array<[string, string]>;
}

const SECTIONS: Section[] = [
  {
    heading: 'Objective',
    body: 'Bid how many tricks you can take each hand, then go take exactly that many (or more, at a small cost). First player or team to 500 points wins.',
  },
  {
    heading: 'Setup',
    body: 'The deck deals out evenly — 13 cards each at 2 or 4 players, 17 each at 3 (the 2♣ is removed so it splits evenly). At 2 players, half the deck sits unused as a kitty.',
  },
  {
    heading: 'Bidding',
    body: "Starting left of the dealer, everyone bids in turn: a number from 0 up to their whole hand, or Nil — a bet on taking exactly zero tricks. Bids are locked in before a single card is played.",
  },
  {
    heading: 'Playing a trick',
    body: "Whoever's turn it is leads any card except a spade — unless spades have already been \"broken\" (played to an earlier trick) or that's genuinely all they have left. Everyone else must follow the suit that was led if they can; if they can't, they may play anything, including a spade. Highest spade played wins the trick outright; if no spades were played, the highest card of the suit that was led wins. The trick's winner leads the next one.",
  },
  {
    heading: 'Making your bid',
    items: [
      ['Made it exactly or with extras', '10 points per trick bid, plus 1 point per extra trick ("bag") over the bid'],
      ["Didn't make it", 'Lose 10 points per trick bid — no partial credit'],
      ['10 bags accumulated', 'Costs a 100-point penalty and the bag count resets'],
    ],
  },
  {
    heading: 'Nil bids',
    body: 'A Nil bid is scored separately from the group\'s regular bid: +100 if that player takes zero tricks all hand, -100 if they take even one (and every trick they do win still counts as a bag for their group).',
  },
  {
    heading: 'Partners mode',
    body: "Only available at a full table of 4: seats 1 and 3 team up against seats 2 and 4. Partners' bids and tricks are combined and scored as one group — you win or lose together.",
  },
  {
    heading: 'Winning',
    body: 'The moment any group\'s score crosses 500, the match ends after that hand — whoever (or whichever team) has the higher total takes it.',
  },
];

const SIMPLIFIED_SECTION: Section = {
  heading: 'Optional: Simplified Scoring',
  body: 'A house-rule variant that turns off the two riskier, more advanced wrinkles — no Nil bids, and no bag penalty. Still a straightforward bid-and-make-it game underneath.',
};

interface HowToPlayProps {
  onClose: () => void;
  /** Whether simplifiedScoring is active in the current match, if there is one — undefined
   * (e.g. the pre-game screens) just shows the rule as background info without an ON/OFF
   * badge. */
  simplifiedScoringInThisMatch?: boolean;
}

export function HowToPlay({ onClose, simplifiedScoringInThisMatch }: HowToPlayProps) {
  const sections =
    simplifiedScoringInThisMatch === undefined
      ? [...SECTIONS, SIMPLIFIED_SECTION]
      : [
          ...SECTIONS,
          {
            ...SIMPLIFIED_SECTION,
            body: `${SIMPLIFIED_SECTION.body} This match: ${simplifiedScoringInThisMatch ? 'ON' : 'OFF'}.`,
          },
        ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>❓ How to Play</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="how-to-play__body">
          {sections.map((section) => (
            <div key={section.heading} className="how-to-play__section">
              <h3>{section.heading}</h3>
              {section.items ? (
                <ul>
                  {section.items.map(([name, desc]) => (
                    <li key={name}>
                      <strong>{name}</strong> — {desc}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{section.body}</p>
              )}
            </div>
          ))}
        </div>
        <p className="how-to-play__footer">
          Stuck mid-turn? Close this and tap <strong>🤔 What should I play?</strong> for a live suggestion.
        </p>
      </div>
    </div>
  );
}
