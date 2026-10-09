import { requireFixtures } from '../enabled';
import { OtpForm } from './OtpForm';

export default async function OtpFixture() {
  await requireFixtures();
  return <OtpForm />;
}
