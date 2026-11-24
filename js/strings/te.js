import owner from './te-owner.js';
import staff from './te-staff.js';
import phone from './te-phone.js';

// Telugu UI strings: spoken Telugu with common English words (invoice, stock, dealer).
// Dealer, product and brand names are never translated.
// NEEDS NATIVE CHECK: every string here is for Busy Fox to review with a native speaker.
export default {
  ...owner,
  ...staff,
  ...phone,
  'app.title': 'Devansh Marketing',
  'a11y.skip': 'కంటెంట్‌కి వెళ్ళండి',
  'role.landing': 'డెమో',
  'role.owner': 'ఓనర్',
  'role.staff': 'స్టాఫ్',
  'role.dealer': 'డీలర్',
  'role.driver': 'డ్రైవర్',
  'role.whatsapp': 'వాట్సాప్',
  'role.unknown': 'డెమో',
  'role.change': 'రోల్ మార్చండి',
  'search.label': 'వెతకండి',
  'search.placeholder': 'డీలర్, బ్రాండ్, ప్రోడక్ట్ లేదా ఇన్వాయిస్ వెతకండి',
  'lang.label': 'భాష',
  'footer.sample': 'శాంపిల్ డేటా · Busy Fox డెమో',
  'landing.title': 'Devansh Marketing డెమో',
  'landing.intro': 'ఏ రోల్ నుంచి చూడాలో ఎంచుకోండి.',
  'landing.owner': 'ఓనర్',
  'landing.owner.desc': 'డబ్బు ఎక్కడ ఉందో ఒకే చోట చూడండి',
  'landing.staff': 'స్టాఫ్',
  'landing.staff.desc': 'గోడౌన్, ఆర్డర్లు, పేమెంట్లు',
  'landing.dealer': 'డీలర్',
  'landing.dealer.desc': 'ఆర్డర్లు, ఇన్వాయిస్లు, మీరు ఇవ్వాల్సిన బాకీ',
  'landing.driver': 'డ్రైవర్',
  'landing.driver.desc': 'ఈ రోజు ట్రిప్, డెలివరీలు',
  'view.soon': 'ఈ స్క్రీన్ త్వరలో వస్తుంది.',
  'unknown.title': 'ఈ పేజీ దొరకలేదు',
  'unknown.back': 'మొదటి పేజీకి వెళ్ళండి',
};
