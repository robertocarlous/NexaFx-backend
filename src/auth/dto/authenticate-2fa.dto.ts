import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AuthenticateTwoFactorDto {
  @ApiProperty({
    description: 'Temporary token from login when 2FA is required',
  })
  @IsString()
  tempToken: string;

  @ApiProperty({
    description: '6-digit TOTP code or 8-character backup code',
    example: '123456',
  })
  @IsString()
  @MinLength(6)
  totpToken: string;
}
