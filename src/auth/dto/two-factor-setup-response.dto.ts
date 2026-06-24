import { ApiProperty } from '@nestjs/swagger';

export class TwoFactorSetupResponseDto {
  @ApiProperty({
    description: 'Base64-encoded PNG QR code for authenticator apps',
    example: 'iVBORw0KGgoAAAANSUhEUgAA...',
  })
  qrCode: string;

  @ApiProperty({
    description: 'Manual entry key for authenticator apps',
    example: 'JBSWY3DPEHPK3PXP',
  })
  manualEntryKey: string;

  @ApiProperty({
    type: [String],
    description: 'Eight single-use backup codes (activate after TOTP verify)',
  })
  backupCodes: string[];
}
