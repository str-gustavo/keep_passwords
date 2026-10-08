export type FieldKind = 'text'|'password'|'secret'|'url'|'email'|'phone'|'date'|'multiline'|'secretMultiline'|'totp'|'number';
export interface FieldDef { key: string; label: string; kind: FieldKind; required?: boolean }
export type RecordTypeId = 'login'|'bankCard'|'bankAccount'|'address'|'contact'|'secureNote'|'passport'|'driverLicense'|'birthCertificate'|'healthInsurance'|'membership'|'softwareLicense'|'sshKey'|'databaseCredentials'|'server'|'wifi'|'file';
export interface RecordTypeDef { id: RecordTypeId; label: string; icon: string; fields: FieldDef[] }

const f = (key: string, label: string, kind: FieldKind = 'text'): FieldDef => ({ key, label, kind });

export const RECORD_TYPES: RecordTypeDef[] = [
  { id: 'login', label: 'Login', icon: 'key-round', fields: [f('login', 'Login'), f('password', 'Senha', 'password'), f('url', 'URL', 'url'), f('totp', 'Código 2FA (TOTP)', 'totp')] },
  { id: 'bankCard', label: 'Cartão de crédito', icon: 'credit-card', fields: [f('cardholderName', 'Nome no cartão'), f('cardNumber', 'Número do cartão', 'secret'), f('expiration', 'Validade (MM/AAAA)'), f('securityCode', 'Código de segurança', 'secret'), f('pin', 'PIN', 'secret')] },
  { id: 'bankAccount', label: 'Conta bancária', icon: 'landmark', fields: [f('bankName', 'Banco'), f('accountType', 'Tipo de conta'), f('routingNumber', 'Agência'), f('accountNumber', 'Número da conta', 'secret'), f('login', 'Login'), f('password', 'Senha', 'password'), f('url', 'URL', 'url')] },
  { id: 'address', label: 'Endereço', icon: 'map-pin', fields: [f('street', 'Rua'), f('street2', 'Complemento'), f('city', 'Cidade'), f('state', 'Estado'), f('zip', 'CEP'), f('country', 'País')] },
  { id: 'contact', label: 'Contato', icon: 'user-round', fields: [f('firstName', 'Nome'), f('lastName', 'Sobrenome'), f('company', 'Empresa'), f('email', 'E-mail', 'email'), f('phone', 'Telefone', 'phone')] },
  { id: 'secureNote', label: 'Nota segura', icon: 'sticky-note', fields: [] },
  { id: 'passport', label: 'Passaporte', icon: 'book-user', fields: [f('passportNumber', 'Número do passaporte', 'secret'), f('fullName', 'Nome completo'), f('nationality', 'Nacionalidade'), f('birthDate', 'Data de nascimento', 'date'), f('issueDate', 'Data de emissão', 'date'), f('expirationDate', 'Data de validade', 'date')] },
  { id: 'driverLicense', label: 'CNH', icon: 'car', fields: [f('licenseNumber', 'Número da CNH', 'secret'), f('fullName', 'Nome completo'), f('birthDate', 'Data de nascimento', 'date'), f('expirationDate', 'Validade', 'date'), f('issuer', 'Órgão emissor')] },
  { id: 'birthCertificate', label: 'Certidão de nascimento', icon: 'baby', fields: [f('fullName', 'Nome completo'), f('birthDate', 'Data de nascimento', 'date'), f('registryNumber', 'Matrícula', 'secret'), f('city', 'Cidade'), f('state', 'Estado')] },
  { id: 'healthInsurance', label: 'Plano de saúde', icon: 'heart-pulse', fields: [f('provider', 'Operadora'), f('memberId', 'Número da carteirinha', 'secret'), f('groupNumber', 'Número do grupo'), f('phone', 'Telefone', 'phone'), f('url', 'URL', 'url')] },
  { id: 'membership', label: 'Associação', icon: 'id-card', fields: [f('organization', 'Organização'), f('memberId', 'Número de membro'), f('login', 'Login'), f('password', 'Senha', 'password'), f('url', 'URL', 'url')] },
  { id: 'softwareLicense', label: 'Licença de software', icon: 'package', fields: [f('product', 'Produto'), f('licenseKey', 'Chave de licença', 'secret'), f('email', 'E-mail', 'email'), f('purchaseDate', 'Data da compra', 'date'), f('url', 'URL', 'url')] },
  { id: 'sshKey', label: 'Chave SSH', icon: 'terminal', fields: [f('login', 'Login'), f('hostname', 'Host'), f('port', 'Porta', 'number'), f('privateKey', 'Chave privada', 'secretMultiline'), f('publicKey', 'Chave pública', 'multiline'), f('passphrase', 'Passphrase', 'password')] },
  { id: 'databaseCredentials', label: 'Credencial de banco de dados', icon: 'database', fields: [f('databaseType', 'Tipo de banco'), f('hostname', 'Host'), f('port', 'Porta', 'number'), f('databaseName', 'Nome do banco'), f('login', 'Login'), f('password', 'Senha', 'password')] },
  { id: 'server', label: 'Servidor', icon: 'server', fields: [f('hostname', 'Host'), f('port', 'Porta', 'number'), f('login', 'Login'), f('password', 'Senha', 'password'), f('url', 'URL', 'url')] },
  { id: 'wifi', label: 'Rede Wi-Fi', icon: 'wifi', fields: [f('ssid', 'Nome da rede (SSID)'), f('password', 'Senha', 'password'), f('securityType', 'Tipo de segurança')] },
  { id: 'file', label: 'Arquivo', icon: 'paperclip', fields: [] },
];

export function getRecordType(id: string): RecordTypeDef {
  const t = RECORD_TYPES.find((x) => x.id === id);
  if (!t) throw new Error(`Tipo de registro desconhecido: ${id}`);
  return t;
}
export const isRecordTypeId = (id: string): id is RecordTypeId => RECORD_TYPES.some((x) => x.id === id);
