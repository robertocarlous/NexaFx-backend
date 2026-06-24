import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class TwoFactorTokenDto {
  @ApiProperty({ example: '123456', description: '6-digit TOTP code' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'token must be a 6-digit TOTP code' })
  token: string;
}
