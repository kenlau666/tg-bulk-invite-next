from flask import request, jsonify
from telethon.tl.functions.channels import InviteToChannelRequest
from connect import app, active_clients

@app.route('/getParticipants', methods=['POST'])
async def get_participants():
    data = request.json
    source_groups = data.get('sourceGroups')
    target_group = data.get('targetGroup')
    session_id = data.get('sessionId')

    try:
        if session_id not in active_clients:
            return jsonify({
                'success': False,
                'message': 'No active session found'
            }), 400

        client = active_clients[session_id]['client']
        all_participants = []
        invited_count = 0

        # Get target group participants
        target_group_name = target_group.replace('https://t.me/', '')
        target_entity = await client.get_entity(target_group_name)
        target_participants = await client.get_participants(target_entity)
        target_member_ids = {p.id for p in target_participants}

        # Process source groups
        for group_link in source_groups:
            try:
                group_name = group_link.replace('https://t.me/', '')
                entity = await client.get_entity(group_name)
                participants = await client.get_participants(entity)

                for participant in participants:
                    if participant.id in target_member_ids:
                        print(f"{participant.first_name or 'User'} is already in target group")
                        continue

                    try:
                        await client(InviteToChannelRequest(
                            channel=target_entity,
                            users=[participant]
                        ))
                        invited_count += 1
                        print(f"Invited {participant.first_name or 'User'} to target group")
                    except Exception as e:
                        print(f"Failed to invite {participant.first_name or 'User'}: {str(e)}")

                    all_participants.append(participant)

            except Exception as e:
                print(f"Error getting participants from {group_link}: {str(e)}")

        return jsonify({
            'success': True,
            'message': f'Processed {len(all_participants)} participants, invited {invited_count} new members',
            'participants': [{'id': p.id, 'firstName': p.first_name} for p in all_participants]
        })

    except Exception as e:
        print(f"Error getting participants: {str(e)}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True) 