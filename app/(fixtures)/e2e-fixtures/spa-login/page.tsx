import { requireFixtures } from '../enabled';
import { SpaLoginForm } from './SpaLoginForm';

export default async function SpaLoginFixture() {
  await requireFixtures();
  return <SpaLoginForm />;
}
