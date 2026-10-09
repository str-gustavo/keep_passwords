import { requireFixtures } from '../enabled';
import { SignupForm } from './SignupForm';

export default async function SignupFixture() {
  await requireFixtures();
  return <SignupForm />;
}
