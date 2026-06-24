import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/decorators/current-user.decorator';
import { KycGuard } from '../../kyc/guards/kyc.guard';
import { CreateV2TransactionDto } from './dto/create-transaction.dto';
import { V2TransactionQueryDto } from './dto/transaction-query.dto';
import { V2TransactionsService } from './transactions.service';

@ApiTags('Transactions V2')
@ApiBearerAuth('access-token')
@Controller('transactions')
export class V2TransactionsController {
  constructor(private readonly transactionsService: V2TransactionsService) {}

  @Post()
  @UseGuards(KycGuard)
  @ApiOperation({
    summary: 'Create a new transaction with double-entry ledger',
  })
  @ApiResponse({ status: 201, description: 'Transaction created' })
  @ApiResponse({ status: 403, description: 'KYC not approved' })
  @ApiResponse({ status: 422, description: 'Insufficient balance' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateV2TransactionDto,
  ) {
    return this.transactionsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List user transactions with filters' })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: V2TransactionQueryDto,
  ) {
    return this.transactionsService.findAll(user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction with ledger entries' })
  async findOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactionsService.findOne(user.userId, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending transaction' })
  @ApiResponse({ status: 422, description: 'Transaction cannot be cancelled' })
  async cancel(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactionsService.cancel(user.userId, id);
  }
}
