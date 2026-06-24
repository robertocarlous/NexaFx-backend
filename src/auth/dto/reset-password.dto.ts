import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'a1b2c3d4e5f6...',
    description: 'Single-use password reset token from the reset email link',
  })
  @IsString({ message: 'token must be a string' })
  @IsNotEmpty({ message: 'token is required' })
  token: string;

  @ApiProperty({
    example: 'NewStrongPassword!123',
    description: 'New password (12–128 characters)',
  })
  @IsString({ message: 'newPassword must be a string' })
  @IsNotEmpty({ message: 'newPassword is required' })
  @MinLength(12, { message: 'newPassword must be at least 12 characters' })
  @MaxLength(128, { message: 'newPassword must not exceed 128 characters' })
  newPassword: string;
}
