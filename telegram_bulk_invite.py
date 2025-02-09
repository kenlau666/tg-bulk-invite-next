from telethon.sync import TelegramClient
from telethon.tl.functions.channels import InviteToChannelRequest
from telethon.tl.types import InputPeerChannel
from telethon.errors import FloodWaitError, UserPrivacyRestrictedError, PeerFloodError
import asyncio
import time
import configparser
from datetime import datetime

# Read config
config = configparser.ConfigParser()
config.read('config.ini')

# Telegram API credentials
api_id = config['Telegram']['api_id']
api_hash = config['Telegram']['api_hash']
phone = config['Telegram']['phone']

async def main():
    # Connect to Telegram
    client = TelegramClient('session_name', api_id, api_hash)
    await client.start(phone)
    
    # Get source and target group details
    source_group = input("Enter source group username or link: ")
    target_group = input("Enter target group username or link: ")
    
    try:
        # Get all participants from source group
        source_participants = await client.get_participants(source_group)
        target_channel = await client.get_entity(target_group)
        
        total_users = len(source_participants)
        print(f"Found {total_users} participants in source group")
        
        # Process users in batches of 50
        batch_size = 50
        success_count = 0
        start_time = datetime.now()

        for i in range(0, total_users, batch_size):
            batch = source_participants[i:i + batch_size]
            try:
                # Invite batch of users
                await client(InviteToChannelRequest(
                    channel=target_channel,
                    users=batch
                ))
                success_count += len(batch)
                
                # Progress update
                elapsed_time = (datetime.now() - start_time).seconds
                progress = (i + len(batch)) / total_users * 100
                print(f"Progress: {progress:.1f}% ({success_count}/{total_users}) "
                      f"Time elapsed: {elapsed_time}s")
                
                # Reduced wait time between batches
                await asyncio.sleep(0.5)
                
            except UserPrivacyRestrictedError:
                print(f"Some users in batch couldn't be invited due to privacy settings")
                continue
            except PeerFloodError:
                print("Too many requests, waiting 5 minutes before continuing...")
                await asyncio.sleep(300)  # Reduced wait time to 5 minutes
            except FloodWaitError as e:
                print(f"Hit flood limit, waiting {e.seconds} seconds")
                await asyncio.sleep(e.seconds)
            except Exception as e:
                print(f"Error inviting batch: {str(e)}")
                # Fallback to individual invites for this batch
                for user in batch:
                    try:
                        await client(InviteToChannelRequest(
                            channel=target_channel,
                            users=[user]
                        ))
                        success_count += 1
                        await asyncio.sleep(0.5)
                    except Exception as e:
                        print(f"Error inviting {user.first_name}: {str(e)}")
                        continue

        total_time = (datetime.now() - start_time).seconds
        print(f"\nInvitation complete!")
        print(f"Successfully invited: {success_count}/{total_users} users")
        print(f"Total time taken: {total_time} seconds")
                
    except Exception as e:
        print(f"An error occurred: {str(e)}")
    
    finally:
        await client.disconnect()

if __name__ == '__main__':
    asyncio.run(main()) 